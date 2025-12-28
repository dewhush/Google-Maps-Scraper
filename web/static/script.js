/**
 * Google Maps Scraper - Frontend JavaScript
 * Handles all UI interactions and API calls
 */

// DOM Elements
const elements = {
    totalContacts: document.getElementById('totalContacts'),
    searchQuery: document.getElementById('searchQuery'),
    maxResults: document.getElementById('maxResults'),
    maxResultsValue: document.getElementById('maxResultsValue'),
    startScrape: document.getElementById('startScrape'),
    progressSection: document.getElementById('progressSection'),
    progressStatus: document.getElementById('progressStatus'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    foundCount: document.getElementById('foundCount'),
    addName: document.getElementById('addName'),
    addPhone: document.getElementById('addPhone'),
    addContact: document.getElementById('addContact'),
    searchContacts: document.getElementById('searchContacts'),
    exportBtn: document.getElementById('exportBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    contactsTableBody: document.getElementById('contactsTableBody'),
    emptyState: document.getElementById('emptyState'),
    toast: document.getElementById('toast')
};

// State
let allContacts = [];
let statusInterval = null;

// ================================
// Utility Functions
// ================================

function showToast(message, type = 'info') {
    const toast = elements.toast;
    toast.querySelector('.toast-message').textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function formatPhone(phone) {
    // Format Indonesian phone number for display
    if (!phone) return '';
    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('62')) {
        phone = '0' + phone.slice(2);
    }
    return phone;
}

// ================================
// API Functions
// ================================

async function fetchContacts() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();

        if (data.success) {
            allContacts = data.contacts;
            elements.totalContacts.textContent = data.total;
            renderContacts(allContacts);
        }
    } catch (error) {
        console.error('Error fetching contacts:', error);
        showToast('Failed to load contacts', 'error');
    }
}

async function startScraping() {
    const query = elements.searchQuery.value.trim();
    const maxResults = parseInt(elements.maxResults.value);

    if (!query) {
        showToast('Please enter a search query', 'error');
        return;
    }

    try {
        const response = await fetch('/api/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, max_results: maxResults })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Scraping started!', 'success');
            elements.startScrape.disabled = true;
            elements.progressSection.style.display = 'block';
            startStatusPolling();
        } else {
            showToast(data.error || 'Failed to start scraping', 'error');
        }
    } catch (error) {
        console.error('Error starting scrape:', error);
        showToast('Failed to start scraping', 'error');
    }
}

async function checkStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        elements.progressStatus.textContent = data.status;
        elements.progressPercent.textContent = `${data.progress}%`;
        elements.progressFill.style.width = `${data.progress}%`;
        elements.foundCount.textContent = data.total_found;

        if (!data.is_running) {
            stopStatusPolling();
            elements.startScrape.disabled = false;

            if (data.error) {
                showToast(`Error: ${data.error}`, 'error');
            } else if (data.progress === 100) {
                showToast('Scraping completed!', 'success');
                fetchContacts();
            }
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

function startStatusPolling() {
    statusInterval = setInterval(checkStatus, 1000);
}

function stopStatusPolling() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}

async function addContactManually() {
    const name = elements.addName.value.trim();
    const phone = elements.addPhone.value.trim();

    if (!name || !phone) {
        showToast('Please enter both name and phone', 'error');
        return;
    }

    try {
        const response = await fetch('/api/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, phone })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Contact added!', 'success');
            elements.addName.value = '';
            elements.addPhone.value = '';
            fetchContacts();
        } else {
            showToast(data.error || 'Failed to add contact', 'error');
        }
    } catch (error) {
        console.error('Error adding contact:', error);
        showToast('Failed to add contact', 'error');
    }
}

async function deleteContact(index) {
    if (!confirm('Are you sure you want to delete this contact?')) {
        return;
    }

    try {
        const response = await fetch(`/api/delete/${index}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showToast('Contact deleted', 'success');
            fetchContacts();
        } else {
            showToast(data.error || 'Failed to delete contact', 'error');
        }
    } catch (error) {
        console.error('Error deleting contact:', error);
        showToast('Failed to delete contact', 'error');
    }
}

function exportContacts() {
    window.location.href = '/api/export';
    showToast('Exporting contacts...', 'success');
}

// ================================
// Render Functions
// ================================

function renderContacts(contacts) {
    const tbody = elements.contactsTableBody;
    const emptyState = elements.emptyState;

    if (contacts.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = contacts.map((contact, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(contact.name)}</td>
            <td>${formatPhone(contact.phone)}</td>
            <td>
                <button class="btn btn-danger" onclick="deleteContact(${index})">
                    🗑️ Delete
                </button>
            </td>
        </tr>
    `).join('');
}

function filterContacts(query) {
    const filtered = allContacts.filter(contact =>
        contact.name.toLowerCase().includes(query.toLowerCase()) ||
        contact.phone.includes(query)
    );
    renderContacts(filtered);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================================
// Event Listeners
// ================================

// Range slider
elements.maxResults.addEventListener('input', (e) => {
    elements.maxResultsValue.textContent = e.target.value;
});

// Start scraping
elements.startScrape.addEventListener('click', startScraping);

// Add contact
elements.addContact.addEventListener('click', addContactManually);

// Enter key for adding contact
elements.addPhone.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addContactManually();
    }
});

// Search contacts
elements.searchContacts.addEventListener('input', (e) => {
    filterContacts(e.target.value);
});

// Export
elements.exportBtn.addEventListener('click', exportContacts);

// Refresh
elements.refreshBtn.addEventListener('click', () => {
    fetchContacts();
    showToast('Contacts refreshed', 'success');
});

// Enter key for search query
elements.searchQuery.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        startScraping();
    }
});

// ================================
// Initialize
// ================================

document.addEventListener('DOMContentLoaded', () => {
    fetchContacts();

    // Check if there's an ongoing scraping operation
    checkStatus().then(() => {
        // If scraping is running, start polling
        fetch('/api/status')
            .then(res => res.json())
            .then(data => {
                if (data.is_running) {
                    elements.startScrape.disabled = true;
                    elements.progressSection.style.display = 'block';
                    startStatusPolling();
                }
            });
    });
});

// Make deleteContact available globally
window.deleteContact = deleteContact;
