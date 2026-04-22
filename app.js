const express = require('express');
const { validateEmail } = require('./validator');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { Transform } = require('stream');
const { Parser } = require('json2csv');
const chardet = require('chardet');
const iconv = require('iconv-lite');

// Read a CSV file with auto-detected encoding and return a UTF-8 readable stream
function createEncodingAwareStream(filePath) {
  // Detect encoding from the file
  const detectedEncoding = chardet.detectFileSync(filePath) || 'utf-8';
  console.log(`Detected CSV encoding: ${detectedEncoding}`);

  // If the file is already UTF-8, just strip BOM and return
  if (detectedEncoding.toLowerCase().includes('utf-8') || detectedEncoding.toLowerCase().includes('utf8')) {
    return fs.createReadStream(filePath)
      .pipe(createBomStripper());
  }

  // Otherwise, decode from detected encoding and re-encode as UTF-8
  return fs.createReadStream(filePath)
    .pipe(iconv.decodeStream(detectedEncoding))
    .pipe(iconv.encodeStream('utf-8'))
    .pipe(createBomStripper());
}

// Transform stream to strip UTF-8 BOM and clean data
function createBomStripper() {
  let isFirst = true;
  return new Transform({
    transform(chunk, encoding, callback) {
      if (isFirst) {
        isFirst = false;
        // Remove UTF-8 BOM (EF BB BF) if present
        if (chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
          chunk = chunk.slice(3);
        }
      }
      callback(null, chunk);
    }
  });
}

// Add ultra-comprehensive global error handlers to prevent application crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Prevent the process from exiting
  if (reason && (reason.code === 'ECONNRESET' || (reason.message && reason.message.includes('ECONNRESET')))) {
    console.log('Caught ECONNRESET in unhandledRejection - continuing execution');
    return;
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Stack trace:', err.stack);

  // Prevent the process from exiting for ECONNRESET errors
  if (err.code === 'ECONNRESET' || (err.message && err.message.includes('ECONNRESET'))) {
    console.log('Caught ECONNRESET in uncaughtException - continuing execution');
    return;
  }

  // For other errors, log and continue (don't exit)
  console.log('Continuing execution despite error:', err.message);
});

// Handle ECONNRESET and other network errors specifically
process.on('uncaughtExceptionMonitor', (err) => {
  console.error('Uncaught Exception Monitor:', err);
  // Prevent the process from exiting
  if (err.code === 'ECONNRESET' || (err.message && err.message.includes('ECONNRESET'))) {
    console.log('Caught ECONNRESET in uncaughtExceptionMonitor - continuing execution');
    return;
  }
});

// Additional specific handling for ECONNRESET
process.on('warning', (warning) => {
  console.warn('Process warning:', warning.name, warning.message);
  if (warning.name === 'MaxListenersExceededWarning') {
    console.warn('MaxListenersExceededWarning detected - this may lead to memory leaks');
  }
});

// Handle SIGTERM and SIGINT for graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});



const app = express();
// Increase the request size limit to handle large bulk email requests
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Set up multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Get instance ID from environment variable
const instanceId = process.env.INSTANCE_ID || 'default';

// In-memory storage for jobs (in production, use a database)
const jobs = new Map();

// Job cleanup: remove completed/failed jobs older than 1 hour to prevent memory leaks
const JOB_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [jobId, job] of jobs.entries()) {
    if ((job.status === 'completed' || job.status === 'failed') && job.finishedAt) {
      if (now - new Date(job.finishedAt).getTime() > JOB_MAX_AGE_MS) {
        jobs.delete(jobId);
        cleaned++;
      }
    }
  }
  if (cleaned > 0) {
    console.log(`Instance ${instanceId}: Cleaned up ${cleaned} old jobs. Active jobs: ${jobs.size}`);
  }
}, 30 * 60 * 1000); // Run every 30 minutes
console.log(`Email Validation API instance ${instanceId} starting...`);

// Single email validation endpoint
app.post('/v1/validate', async (req, res) => {
  const { email, options } = req.body;
  try {
    const result = await validateEmail(email, options || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk email validation endpoint
app.post('/v1/validate/bulk', async (req, res) => {
  const { emails, options } = req.body;

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'emails array is required' });
  }

  // Limit to 100,000 emails per request
  if (emails.length > 100000) {
    return res.status(400).json({ error: 'Maximum 100,000 emails allowed per request' });
  }

  // Create a job ID
  const jobId = uuidv4();

  // Initialize job
  const job = {
    id: jobId,
    status: 'queued',
    total: emails.length,
    completed: 0,
    results: [],
    rowData: emails.map(email => ({ email })), // Store email data for CSV output
    emailColumn: 'email', // Store email column name
    createdAt: new Date(),
    finishedAt: null
  };

  jobs.set(jobId, job);

  console.log(`Instance ${instanceId}: Processing bulk job ${jobId} with ${emails.length} emails`);

  // Start processing in background
  processBulkJob(jobId, emails, options || {});

  res.json({ jobId, status: 'queued' });
});

// CSV upload endpoint for bulk validation
app.post('/v1/validate/bulk/csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const options = req.body.options ? JSON.parse(req.body.options) : {};
    const emailColumn = req.body.emailColumn || 'email';

    const emails = [];
    const rowData = [];

    // Parse CSV file (auto-detect encoding to prevent garbled names)
    await new Promise((resolve, reject) => {
      createEncodingAwareStream(req.file.path)
        .pipe(csv({ mapValues: ({ value }) => value ? value.trim() : value }))
        .on('data', (row) => {
          // Clean column keys (trim whitespace and remove hidden characters)
          const cleanRow = {};
          for (const [key, val] of Object.entries(row)) {
            const cleanKey = key.replace(/[\uFEFF\u200B\u00A0]/g, '').trim();
            cleanRow[cleanKey] = val;
          }
          if (cleanRow[emailColumn]) {
            emails.push(cleanRow[emailColumn].trim());
            rowData.push(cleanRow);
          }
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    // Limit to 100,000 emails per request
    if (emails.length > 100000) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Maximum 100,000 emails allowed per request' });
    }

    if (emails.length === 0) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No emails found in the specified column' });
    }

    // Create a job ID
    const jobId = uuidv4();

    // Initialize job
    const job = {
      id: jobId,
      status: 'queued',
      total: emails.length,
      completed: 0,
      results: [],
      rowData: rowData, // Store original row data for CSV output
      emailColumn: emailColumn, // Store email column name
      createdAt: new Date(),
      finishedAt: null
    };

    jobs.set(jobId, job);

    console.log(`Instance ${instanceId}: Processing CSV bulk job ${jobId} with ${emails.length} emails`);

    // Start processing in background (uses shared bulk processor)
    processBulkEmails(jobId, emails, options || {});

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ jobId, status: 'queued' });
  } catch (error) {
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// New endpoint to parse CSV headers
app.post('/v1/csv/headers', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const headers = [];

    // Parse CSV file to get headers only (auto-detect encoding)
    await new Promise((resolve, reject) => {
      createEncodingAwareStream(req.file.path)
        .pipe(csv())
        .on('headers', (headerRow) => {
          // Clean headers: remove BOM remnants, hidden chars, and trim
          const cleanHeaders = headerRow.map(h => h.replace(/[\uFEFF\u200B\u00A0]/g, '').trim());
          headers.push(...cleanHeaders);
          // Stop after getting headers
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ headers });
  } catch (error) {
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get job status
app.get('/v1/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt
  });
});

// Get job results as JSON
app.get('/v1/jobs/:jobId/results', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.id,
    results: job.results
  });
});

// Get job results as CSV
app.get('/v1/jobs/:jobId/results/csv', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job is not completed yet' });
  }

  try {
    let csvData;

    // Check if this is a CSV job (has rowData) or regular bulk job
    if (job.rowData && job.rowData.length > 0) {
      // CSV job - combine original row data with validation results
      csvData = job.rowData.map((row, index) => {
        const result = job.results[index] || {};
        return {
          ...row,
          validation_status: result.status || 'unknown',
          validation_score: result.score || 0,
          is_syntax_valid: result.syntax || false,
          is_disposable: result.disposable || false,
          is_role_account: result.role || false,
          mx_records: result.mx ? result.mx.join(';') : '',
          smtp_check: result.smtp ? (result.smtp.ok ? 'passed' : 'failed') : 'not_performed'
        };
      });
    } else {
      // Regular bulk job - create CSV data from results only
      csvData = job.results.map(result => {
        return {
          email: result.email,
          validation_status: result.status || 'unknown',
          validation_score: result.score || 0,
          is_syntax_valid: result.syntax || false,
          is_disposable: result.disposable || false,
          is_role_account: result.role || false,
          mx_records: result.mx ? result.mx.join(';') : '',
          smtp_check: result.smtp ? (result.smtp.ok ? 'passed' : 'failed') : 'not_performed'
        };
      });
    }

    // Create CSV with UTF-8 BOM for proper Excel display
    const json2csvParser = new Parser();
    const csvOutput = json2csvParser.parse(csvData);

    // Add UTF-8 BOM so Excel opens with correct encoding
    const BOM = '\uFEFF';

    // Set headers for file download
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`validation_results_${jobId}.csv`);
    res.send(BOM + csvOutput);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ error: 'Failed to generate CSV output' });
  }
});

// Process bulk job — delegates to shared processing function
function processBulkJob(jobId, emails, options) {
  return processBulkEmails(jobId, emails, options);
}

// Shared bulk processing logic (used by both JSON and CSV bulk endpoints)
async function processBulkEmails(jobId, emails, options) {
  try {
    const job = jobs.get(jobId);
    if (!job) {
      console.error(`Instance ${instanceId}: Job ${jobId} not found`);
      return;
    }

    job.status = 'running';
    console.log(`Instance ${instanceId}: Starting processing of job ${jobId} with ${emails.length} emails`);

    const batchSize = 20;
    const concurrentBatches = 3;
    const results = new Array(emails.length);
    let completedCount = 0;

    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push({ index: i, emails: emails.slice(i, i + batchSize) });
    }

    for (let i = 0; i < batches.length; i += concurrentBatches) {
      const batchGroup = batches.slice(i, i + concurrentBatches);
      const batchPromises = batchGroup.map(batch =>
        Promise.allSettled(batch.emails.map(email => validateEmail(email, options)))
          .then(batchResults => ({ batchIndex: batch.index, results: batchResults }))
      );

      try {
        const batchGroupResults = await Promise.all(batchPromises);

        for (const batchResult of batchGroupResults) {
          const { batchIndex, results: batchResults } = batchResult;
          const batchEmails = batches.find(b => b.index === batchIndex).emails;

          batchResults.forEach((result, index) => {
            const emailIndex = batchIndex + index;
            if (result.status === 'fulfilled') {
              results[emailIndex] = result.value;
            } else {
              const email = batchEmails[index];
              console.error(`Instance ${instanceId}: Error validating email ${email}:`, result.reason);
              results[emailIndex] = { email, error: result.reason.message };
            }
          });

          completedCount = Math.min(batchIndex + batchEmails.length, emails.length);
          job.completed = completedCount;
          job.results = results.filter(r => r !== undefined);
          jobs.set(jobId, job);

          if (Math.floor(completedCount / 1000) > Math.floor((completedCount - batchEmails.length) / 1000) ||
            completedCount === emails.length) {
            console.log(`Instance ${instanceId}: Job ${jobId} progress: ${completedCount}/${job.total}`);
          }
        }
      } catch (error) {
        console.error(`Instance ${instanceId}: Batch group processing error:`, error);
      }

      if (i + concurrentBatches < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    job.results = results.filter(r => r !== undefined);
    job.status = 'completed';
    job.finishedAt = new Date();
    jobs.set(jobId, job);

    console.log(`Instance ${instanceId}: Completed processing of job ${jobId}`);
  } catch (error) {
    console.error(`Instance ${instanceId}: Unhandled error in processBulkEmails for job ${jobId}:`, error);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.finishedAt = new Date();
      jobs.set(jobId, job);
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    instance: instanceId,
    timestamp: new Date(),
    activeJobs: Array.from(jobs.values()).filter(job => job.status === 'running').length
  });
});

// Cache clear endpoint
app.post('/v1/cache/clear', (req, res) => {
  const { clearCache } = require('./validator');
  const result = clearCache();
  console.log(`Instance ${instanceId}: Cache cleared`);
  res.json(result);
});

// Admin dashboard endpoints
app.get('/api/stats', (req, res) => {
  const stats = {
    totalJobs: jobs.size,
    activeJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    instance: instanceId
  };

  jobs.forEach(job => {
    switch (job.status) {
      case 'running':
        stats.activeJobs++;
        break;
      case 'completed':
        stats.completedJobs++;
        break;
      case 'failed':
        stats.failedJobs++;
        break;
    }
  });

  res.json(stats);
});

app.get('/api/jobs', (req, res) => {
  // Convert jobs map to array
  const jobsArray = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 1000); // Increased limit to 1000 most recent jobs

  res.json(jobsArray);
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Email Validation API instance ${instanceId} listening on port ${PORT}`));

module.exports = app;