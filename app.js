const express = require('express');
const { validateEmail } = require('./validator');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { Parser } = require('json2csv');

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

// Override the emit method to catch ECONNRESET errors at the process level
const originalEmit = process.emit;
process.emit = function(name, data) {
  if (name === 'uncaughtException' && data && (data.code === 'ECONNRESET' || (data.message && data.message.includes('ECONNRESET')))) {
    console.error('Caught ECONNRESET at process level:', data);
    // Return false to prevent the default behavior
    return false;
  }
  // For all other events, use the original emit method
  return originalEmit.apply(this, arguments);
};

// Add event listener for uncaught SMTP errors
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('ECONNRESET')) {
    console.log('Caught ECONNRESET error in SMTP operation - continuing execution');
    return;
  }
  
  // Log the error but don't re-throw
  console.error('Non-ECONNRESET error caught:', err.message);
});

// Add a final safety net - override the fatal exception handler
const originalFatalException = process._fatalException;
if (originalFatalException) {
  process._fatalException = function(err) {
    if (err.code === 'ECONNRESET' || (err.message && err.message.includes('ECONNRESET'))) {
      console.log('Caught ECONNRESET in fatal exception handler - continuing execution');
      return true; // Prevent termination
    }
    // For other errors, call the original handler
    return originalFatalException.apply(this, arguments);
  };
}

const app = express();
// Increase the request size limit to handle large bulk email requests
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
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

// Add instance information to logs
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
    
    // Parse CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (row) => {
          if (row[emailColumn]) {
            emails.push(row[emailColumn]);
            rowData.push(row);
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
    
    // Start processing in background
    processBulkJobWithCSV(jobId, emails, rowData, emailColumn, options || {});
    
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
    
    // Parse CSV file to get headers only
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('headers', (headerRow) => {
          headers.push(...headerRow);
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
    
    // Create CSV
    const json2csvParser = new Parser();
    const csvOutput = json2csvParser.parse(csvData);
    
    // Set headers for file download
    res.header('Content-Type', 'text/csv');
    res.attachment(`validation_results_${jobId}.csv`);
    res.send(csvOutput);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ error: 'Failed to generate CSV output' });
  }
});

// Process bulk job (simulated async processing)
async function processBulkJob(jobId, emails, options) {
  try {
    const job = jobs.get(jobId);
    if (!job) {
      console.error(`Instance ${instanceId}: Job ${jobId} not found`);
      return;
    }
    
    job.status = 'running';
    console.log(`Instance ${instanceId}: Starting processing of job ${jobId} with ${emails.length} emails`);
    
    // Process emails in parallel batches with controlled concurrency
    const batchSize = 10; // Further reduced batch size to reduce concurrent connections
    const concurrentBatches = 1; // Process batches sequentially to minimize ECONNRESET
    const results = new Array(emails.length);
    let completedCount = 0;
    
    // Create all batches
    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push({
        index: i,
        emails: emails.slice(i, i + batchSize)
      });
    }
    
    // Process batches sequentially
    for (let i = 0; i < batches.length; i += concurrentBatches) {
      const batchGroup = batches.slice(i, i + concurrentBatches);
      const batchPromises = batchGroup.map(batch => 
        Promise.allSettled(batch.emails.map(email => validateEmail(email, options)))
          .then(batchResults => ({ batchIndex: batch.index, results: batchResults }))
      );
      
      try {
        const batchGroupResults = await Promise.all(batchPromises);
        
        // Process results from each batch in the group
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
              results[emailIndex] = {
                email,
                error: result.reason.message
              };
            }
          });
          
          // Update job progress
          completedCount = Math.min(batchIndex + batchEmails.length, emails.length);
          job.completed = completedCount;
          job.results = results.filter(r => r !== undefined);
          jobs.set(jobId, job);
          
          // Log progress every 1000 emails
          if (Math.floor(completedCount / 1000) > Math.floor((completedCount - batchEmails.length) / 1000) || 
              completedCount === emails.length) {
            console.log(`Instance ${instanceId}: Job ${jobId} progress: ${completedCount}/${job.total}`);
          }
        }
      } catch (error) {
        console.error(`Instance ${instanceId}: Batch group processing error:`, error);
      }
      
      // Add a small delay between batch groups to prevent overwhelming the system
      if (i + concurrentBatches < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    
    // Filter out any undefined results and finalize job
    job.results = results.filter(r => r !== undefined);
    job.status = 'completed';
    job.finishedAt = new Date();
    jobs.set(jobId, job);
    
    console.log(`Instance ${instanceId}: Completed processing of job ${jobId}`);
  } catch (error) {
    console.error(`Instance ${instanceId}: Unhandled error in processBulkJob for job ${jobId}:`, error);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.finishedAt = new Date();
      jobs.set(jobId, job);
    }
  }
}

// Process bulk job with CSV data using improved parallel processing
async function processBulkJobWithCSV(jobId, emails, rowData, emailColumn, options) {
  try {
    const job = jobs.get(jobId);
    if (!job) {
      console.error(`Instance ${instanceId}: Job ${jobId} not found`);
      return;
    }
    
    job.status = 'running';
    console.log(`Instance ${instanceId}: Starting processing of CSV job ${jobId} with ${emails.length} emails`);
    
    // Process emails in parallel batches with controlled concurrency
    const batchSize = 10; // Further reduced batch size to reduce concurrent connections
    const concurrentBatches = 1; // Process batches sequentially to minimize ECONNRESET
    const results = new Array(emails.length);
    let completedCount = 0;
    
    // Create all batches
    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push({
        index: i,
        emails: emails.slice(i, i + batchSize)
      });
    }
    
    // Process batches sequentially
    for (let i = 0; i < batches.length; i += concurrentBatches) {
      const batchGroup = batches.slice(i, i + concurrentBatches);
      const batchPromises = batchGroup.map(batch => 
        Promise.allSettled(batch.emails.map(email => validateEmail(email, options)))
          .then(batchResults => ({ batchIndex: batch.index, results: batchResults }))
      );
      
      try {
        const batchGroupResults = await Promise.all(batchPromises);
        
        // Process results from each batch in the group
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
              results[emailIndex] = {
                email,
                error: result.reason.message
              };
            }
          });
          
          // Update job progress
          completedCount = Math.min(batchIndex + batchEmails.length, emails.length);
          job.completed = completedCount;
          job.results = results.filter(r => r !== undefined);
          jobs.set(jobId, job);
          
          // Log progress every 1000 emails
          if (Math.floor(completedCount / 1000) > Math.floor((completedCount - batchEmails.length) / 1000) || 
              completedCount === emails.length) {
            console.log(`Instance ${instanceId}: Job ${jobId} progress: ${completedCount}/${job.total}`);
          }
        }
      } catch (error) {
        console.error(`Instance ${instanceId}: Batch group processing error:`, error);
      }
      
      // Add a small delay between batch groups to prevent overwhelming the system
      if (i + concurrentBatches < batches.length) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    
    // Filter out any undefined results and finalize job
    job.results = results.filter(r => r !== undefined);
    job.status = 'completed';
    job.finishedAt = new Date();
    jobs.set(jobId, job);
    
    console.log(`Instance ${instanceId}: Completed processing of CSV job ${jobId}`);
  } catch (error) {
    console.error(`Instance ${instanceId}: Unhandled error in processBulkJobWithCSV for job ${jobId}:`, error);
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
    switch(job.status) {
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