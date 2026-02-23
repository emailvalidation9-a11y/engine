// DOM Elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');
const validateSingleBtn = document.getElementById('validate-single');
const validateBulkBtn = document.getElementById('validate-bulk');
const validateCsvBtn = document.getElementById('validate-csv');
const checkJobBtn = document.getElementById('check-job');
const getResultsBtn = document.getElementById('get-results');
const getCsvResultsBtn = document.getElementById('get-csv-results');
const csvFileInput = document.getElementById('csv-file');
const emailColumnSelect = document.getElementById('email-column');
const emailColumnInput = document.getElementById('email-column-input');
const columnWarning = document.getElementById('column-warning');

// Add event listener for CSV file input change
csvFileInput.addEventListener('change', handleCsvFileChange);

// Tab Switching
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        
        // Update active tab button
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Show active tab pane
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            if (pane.id === `${tabId}-tab`) {
                pane.classList.add('active');
            }
        });
    });
});

// Handle CSV file change to parse headers
async function handleCsvFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Only process if we're on the CSV tab
    const activeTab = document.querySelector('.tab-pane.active');
    if (!activeTab || activeTab.id !== 'csv-tab') return;
    
    try {
        const formData = new FormData();
        formData.append('csvFile', file);
        
        const response = await fetch('/v1/csv/headers', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Failed to parse CSV headers');
        }
        
        const result = await response.json();
        
        if (result.headers && result.headers.length > 0) {
            // Clear previous options
            emailColumnSelect.innerHTML = '<option value="">Select email column</option>';
            
            // Add headers as options
            result.headers.forEach(header => {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                emailColumnSelect.appendChild(option);
            });
            
            // Show select and hide input
            emailColumnSelect.classList.remove('hidden');
            emailColumnInput.classList.add('hidden');
            emailColumnInput.value = '';
        } else {
            // Fallback to text input if no headers found
            emailColumnSelect.classList.add('hidden');
            emailColumnInput.classList.remove('hidden');
            emailColumnInput.value = 'email';
        }
    } catch (error) {
        console.error('Error parsing CSV headers:', error);
        // Fallback to text input on error
        emailColumnSelect.classList.add('hidden');
        emailColumnInput.classList.remove('hidden');
        emailColumnInput.value = 'email';
    }
}

// Single Email Validation
validateSingleBtn.addEventListener('click', async () => {
    const email = document.getElementById('single-email').value.trim();
    const skipSmtp = document.getElementById('skip-smtp').checked;
    
    if (!email) {
        alert('Please enter an email address');
        return;
    }
    
    // Show loading state
    setButtonLoading(validateSingleBtn, true);
    
    try {
        const response = await fetch('/v1/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                options: {
                    skip_smtp: skipSmtp
                }
            })
        });
        
        const result = await response.json();
        displaySingleResult(result);
    } catch (error) {
        displayError('single', error.message);
    } finally {
        setButtonLoading(validateSingleBtn, false);
    }
});

// Bulk Email Validation
validateBulkBtn.addEventListener('click', async () => {
    const emailsText = document.getElementById('bulk-emails').value.trim();
    const skipSmtp = document.getElementById('bulk-skip-smtp').checked;
    
    if (!emailsText) {
        alert('Please enter email addresses');
        return;
    }
    
    const emails = emailsText.split('\n')
        .map(email => email.trim())
        .filter(email => email.length > 0);
    
    if (emails.length === 0) {
        alert('Please enter valid email addresses');
        return;
    }
    
    // Show loading state
    setButtonLoading(validateBulkBtn, true);
    
    try {
        const response = await fetch('/v1/validate/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emails: emails,
                options: {
                    skip_smtp: skipSmtp
                }
            })
        });
        
        const result = await response.json();
        displayBulkResult(result);
    } catch (error) {
        displayError('bulk', error.message);
    } finally {
        setButtonLoading(validateBulkBtn, false);
    }
});

// CSV Upload Validation
validateCsvBtn.addEventListener('click', async () => {
    const csvFile = document.getElementById('csv-file').files[0];
    // Get email column from either select or input
    const emailColumn = emailColumnSelect.classList.contains('hidden') 
        ? emailColumnInput.value.trim() || 'email'
        : emailColumnSelect.value || 'email';
    const skipSmtp = document.getElementById('csv-skip-smtp').checked;
    
    if (!csvFile) {
        alert('Please select a CSV file');
        return;
    }
    
    // Validate email column selection
    if (!emailColumn) {
        columnWarning.classList.remove('hidden');
        return;
    } else {
        columnWarning.classList.add('hidden');
    }
    
    // Show loading state
    setButtonLoading(validateCsvBtn, true);
    
    try {
        const formData = new FormData();
        formData.append('csvFile', csvFile);
        formData.append('emailColumn', emailColumn);
        formData.append('options', JSON.stringify({ skip_smtp: skipSmtp }));
        
        const response = await fetch('/v1/validate/bulk/csv', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        displayCsvResult(result);
    } catch (error) {
        displayError('csv', error.message);
    } finally {
        setButtonLoading(validateCsvBtn, false);
    }
});

// Check Job Status
checkJobBtn.addEventListener('click', async () => {
    const jobId = document.getElementById('job-id').value.trim();
    
    if (!jobId) {
        alert('Please enter a job ID');
        return;
    }
    
    // Show loading state
    setButtonLoading(checkJobBtn, true);
    
    try {
        const response = await fetch(`/v1/jobs/${jobId}`);
        
        if (!response.ok) {
            throw new Error('Job not found');
        }
        
        const result = await response.json();
        displayJobStatus(result);
    } catch (error) {
        displayError('job', error.message);
    } finally {
        setButtonLoading(checkJobBtn, false);
    }
});

// Get Job Results (JSON)
getResultsBtn.addEventListener('click', async () => {
    const jobId = document.getElementById('job-id').value.trim();
    
    if (!jobId) {
        alert('Please enter a job ID');
        return;
    }
    
    // Show loading state
    setButtonLoading(getResultsBtn, true);
    
    try {
        const response = await fetch(`/v1/jobs/${jobId}/results`);
        
        if (!response.ok) {
            throw new Error('Job not found');
        }
        
        const result = await response.json();
        displayJobResults(result);
    } catch (error) {
        displayError('job', error.message);
    } finally {
        setButtonLoading(getResultsBtn, false);
    }
});

// Get Job Results (CSV)
getCsvResultsBtn.addEventListener('click', async () => {
    const jobId = document.getElementById('job-id').value.trim();
    
    if (!jobId) {
        alert('Please enter a job ID');
        return;
    }
    
    try {
        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = `/v1/jobs/${jobId}/results/csv`;
        link.download = `validation_results_${jobId}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        displayError('job', error.message);
    }
});

// Display Single Validation Result
function displaySingleResult(result) {
    const resultContainer = document.getElementById('single-result');
    const resultContent = document.getElementById('single-result-content');
    
    resultContent.innerHTML = `
        <div class="result-item ${result.status}">
            <h4>${result.email}</h4>
            <div class="result-details">
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <span class="status-badge ${result.status}">${result.status}</span>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Score</span>
                    <span class="detail-value">${result.score}/100</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Syntax</span>
                    <span class="detail-value">${result.syntax ? 'Valid' : 'Invalid'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Disposable</span>
                    <span class="detail-value">${result.disposable ? 'Yes' : 'No'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Role Account</span>
                    <span class="detail-value">${result.role ? 'Yes' : 'No'}</span>
                </div>
                ${result.mx && result.mx.length > 0 ? `
                <div class="detail-item">
                    <span class="detail-label">MX Records</span>
                    <span class="detail-value">${result.mx.join(', ')}</span>
                </div>
                ` : ''}
                ${result.smtp ? `
                <div class="detail-item">
                    <span class="detail-label">SMTP Check</span>
                    <span class="detail-value">${result.smtp.ok ? 'Passed' : 'Failed'}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    resultContainer.classList.remove('hidden');
}

// Display Bulk Validation Result
function displayBulkResult(result) {
    const resultContainer = document.getElementById('bulk-result');
    const resultContent = document.getElementById('bulk-result-content');
    
    resultContent.innerHTML = `
        <div class="result-item">
            <h4>Bulk Validation Job Created</h4>
            <div class="result-details">
                <div class="detail-item">
                    <span class="detail-label">Job ID</span>
                    <span class="detail-value">${result.jobId}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <span class="status-badge ${result.status}">${result.status}</span>
                    </span>
                </div>
            </div>
            <p>You can track this job in the "Job Tracking" tab using the Job ID above.</p>
        </div>
    `;
    
    resultContainer.classList.remove('hidden');
}

// Display CSV Validation Result
function displayCsvResult(result) {
    const resultContainer = document.getElementById('csv-result');
    const resultContent = document.getElementById('csv-result-content');
    
    resultContent.innerHTML = `
        <div class="result-item">
            <h4>CSV Validation Job Created</h4>
            <div class="result-details">
                <div class="detail-item">
                    <span class="detail-label">Job ID</span>
                    <span class="detail-value">${result.jobId}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <span class="status-badge ${result.status}">${result.status}</span>
                    </span>
                </div>
            </div>
            <p>You can track this job in the "Job Tracking" tab using the Job ID above.</p>
            <p>Once completed, you can download the results as a CSV file with all validation information.</p>
        </div>
    `;
    
    resultContainer.classList.remove('hidden');
}

// Display Job Status
function displayJobStatus(result) {
    const resultContainer = document.getElementById('job-result');
    const resultContent = document.getElementById('job-result-content');
    
    const progress = result.total > 0 ? Math.round((result.completed / result.total) * 100) : 0;
    
    resultContent.innerHTML = `
        <div class="result-item">
            <h4>Job Status</h4>
            <div class="result-details">
                <div class="detail-item">
                    <span class="detail-label">Job ID</span>
                    <span class="detail-value">${result.id}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <div class="job-status">
                            <div class="job-status-indicator ${result.status}"></div>
                            <span class="status-badge ${result.status}">${result.status}</span>
                        </div>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Progress</span>
                    <span class="detail-value">${result.completed} / ${result.total}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created</span>
                    <span class="detail-value">${new Date(result.createdAt).toLocaleString()}</span>
                </div>
                ${result.finishedAt ? `
                <div class="detail-item">
                    <span class="detail-label">Finished</span>
                    <span class="detail-value">${new Date(result.finishedAt).toLocaleString()}</span>
                </div>
                ` : ''}
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
        </div>
    `;
    
    resultContainer.classList.remove('hidden');
}

// Display Job Results
function displayJobResults(result) {
    const resultContainer = document.getElementById('job-result');
    const resultContent = document.getElementById('job-result-content');
    
    if (!result.results || result.results.length === 0) {
        resultContent.innerHTML = `
            <div class="result-item">
                <h4>No Results Found</h4>
                <p>This job may still be processing or has no results.</p>
            </div>
        `;
    } else {
        let resultsHtml = `
            <div class="result-item">
                <h4>Job Results</h4>
                <p>Job ID: ${result.jobId}</p>
                <p>Total Results: ${result.results.length}</p>
            </div>
        `;
        
        result.results.forEach(item => {
            resultsHtml += `
                <div class="result-item ${item.status}">
                    <h4>${item.email}</h4>
                    <div class="result-details">
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">
                                <span class="status-badge ${item.status}">${item.status}</span>
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Score</span>
                            <span class="detail-value">${item.score || 0}/100</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Syntax</span>
                            <span class="detail-value">${item.syntax ? 'Valid' : 'Invalid'}</span>
                        </div>
                        ${item.disposable !== undefined ? `
                        <div class="detail-item">
                            <span class="detail-label">Disposable</span>
                            <span class="detail-value">${item.disposable ? 'Yes' : 'No'}</span>
                        </div>
                        ` : ''}
                        ${item.role !== undefined ? `
                        <div class="detail-item">
                            <span class="detail-label">Role Account</span>
                            <span class="detail-value">${item.role ? 'Yes' : 'No'}</span>
                        </div>
                        ` : ''}
                        ${item.mx && item.mx.length > 0 ? `
                        <div class="detail-item">
                            <span class="detail-label">MX Records</span>
                            <span class="detail-value">${item.mx.join(', ')}</span>
                        </div>
                        ` : ''}
                        ${item.smtp ? `
                        <div class="detail-item">
                            <span class="detail-label">SMTP Check</span>
                            <span class="detail-value">${item.smtp.ok ? 'Passed' : 'Failed'}</span>
                        </div>
                        ` : ''}
                        ${item.error ? `
                        <div class="detail-item">
                            <span class="detail-label">Error</span>
                            <span class="detail-value" style="color: #f44336;">${item.error}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        resultContent.innerHTML = resultsHtml;
    }
    
    resultContainer.classList.remove('hidden');
}

// Display Error
function displayError(type, message) {
    let resultContainer, resultContent;
    
    switch(type) {
        case 'single':
            resultContainer = document.getElementById('single-result');
            resultContent = document.getElementById('single-result-content');
            break;
        case 'bulk':
            resultContainer = document.getElementById('bulk-result');
            resultContent = document.getElementById('bulk-result-content');
            break;
        case 'csv':
            resultContainer = document.getElementById('csv-result');
            resultContent = document.getElementById('csv-result-content');
            break;
        case 'job':
            resultContainer = document.getElementById('job-result');
            resultContent = document.getElementById('job-result-content');
            break;
    }
    
    resultContent.innerHTML = `
        <div class="result-item invalid">
            <h4>Error</h4>
            <p>${message}</p>
        </div>
    `;
    
    resultContainer.classList.remove('hidden');
}

// Set Button Loading State
function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.innerHTML = '<span class="spinner"></span> <span>Processing...</span>';
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        switch(button.id) {
            case 'validate-single':
                button.innerHTML = 'Validate Email';
                break;
            case 'validate-bulk':
                button.innerHTML = 'Validate Emails';
                break;
            case 'validate-csv':
                button.innerHTML = 'Validate CSV';
                break;
            case 'check-job':
                button.innerHTML = 'Check Job Status';
                break;
            case 'get-results':
                button.innerHTML = 'Get Results (JSON)';
                break;
        }
        button.disabled = false;
    }
}

// Initialize the UI
document.addEventListener('DOMContentLoaded', () => {
    // Set up sample data for demo purposes
    document.getElementById('bulk-emails').value = 
        'support@google.com\n' +
        'info@microsoft.com\n' +
        'help@github.com\n' +
        'invalid-email\n' +
        'test@mailinator.com';
});