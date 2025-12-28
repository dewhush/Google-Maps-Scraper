"""
Google Maps Scraper - Web Application
Flask backend for the Google Maps Scraper
"""

from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import json
import os
import sys
import threading
import time
from datetime import datetime

# Add parent directory to path to import the crawler
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Global state for scraping progress
scraping_state = {
    'is_running': False,
    'progress': 0,
    'status': 'idle',
    'results': [],
    'total_found': 0,
    'current_query': '',
    'error': None
}

# Data file path
DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data.json')


def load_existing_data():
    """Load existing scraped data from data.json"""
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('contacts', [])
    except Exception as e:
        print(f"Error loading data: {e}")
    return []


def save_data(contacts):
    """Save contacts to data.json"""
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump({'contacts': contacts}, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving data: {e}")
        return False


def run_scraper(query, max_results):
    """Run the scraper in a background thread"""
    global scraping_state
    
    try:
        from main import GoogleMapsCrawler
        
        scraping_state['is_running'] = True
        scraping_state['progress'] = 0
        scraping_state['status'] = 'Initializing browser...'
        scraping_state['current_query'] = query
        scraping_state['error'] = None
        scraping_state['results'] = []
        
        # Initialize crawler
        crawler = GoogleMapsCrawler(headless=True)
        
        scraping_state['status'] = f'Searching: {query}'
        scraping_state['progress'] = 10
        
        # Search for places
        crawler.search_places(query, max_results=max_results)
        
        scraping_state['status'] = 'Extracting URLs...'
        scraping_state['progress'] = 30
        
        # Get place URLs
        place_urls = crawler.extract_place_urls()
        total_urls = len(place_urls)
        
        scraping_state['status'] = f'Found {total_urls} places. Scraping details...'
        scraping_state['progress'] = 40
        
        # Scrape each place
        results = []
        for i, url in enumerate(place_urls[:max_results]):
            try:
                scraping_state['status'] = f'Scraping place {i+1}/{min(total_urls, max_results)}...'
                scraping_state['progress'] = 40 + int((i / min(total_urls, max_results)) * 50)
                
                place_data = crawler.scrape_place_details(url)
                if place_data and place_data.get('phone'):
                    results.append({
                        'name': place_data.get('name', 'Unknown'),
                        'phone': place_data.get('phone', ''),
                        'address': place_data.get('address', ''),
                        'rating': place_data.get('rating', ''),
                        'reviews': place_data.get('reviews', '')
                    })
                    scraping_state['results'] = results
                    scraping_state['total_found'] = len(results)
                
                time.sleep(1)  # Delay between requests
            except Exception as e:
                print(f"Error scraping place: {e}")
                continue
        
        # Save results
        scraping_state['status'] = 'Saving results...'
        scraping_state['progress'] = 95
        
        # Merge with existing data
        existing = load_existing_data()
        existing_phones = {c.get('phone') for c in existing}
        
        new_contacts = []
        for r in results:
            if r['phone'] not in existing_phones:
                new_contacts.append({
                    'name': r['name'],
                    'phone': r['phone']
                })
                existing_phones.add(r['phone'])
        
        all_contacts = existing + new_contacts
        save_data(all_contacts)
        
        crawler.close()
        
        scraping_state['status'] = f'Complete! Found {len(results)} places, {len(new_contacts)} new contacts added.'
        scraping_state['progress'] = 100
        scraping_state['is_running'] = False
        
    except Exception as e:
        scraping_state['error'] = str(e)
        scraping_state['status'] = f'Error: {str(e)}'
        scraping_state['is_running'] = False


@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')


@app.route('/api/data')
def get_data():
    """Get all scraped contacts"""
    contacts = load_existing_data()
    return jsonify({
        'success': True,
        'contacts': contacts,
        'total': len(contacts)
    })


@app.route('/api/scrape', methods=['POST'])
def start_scrape():
    """Start a new scraping job"""
    global scraping_state
    
    if scraping_state['is_running']:
        return jsonify({
            'success': False,
            'error': 'A scraping job is already running'
        })
    
    data = request.get_json()
    query = data.get('query', 'coffee shop Jakarta')
    max_results = data.get('max_results', 20)
    
    # Start scraping in background thread
    thread = threading.Thread(target=run_scraper, args=(query, max_results))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Scraping started'
    })


@app.route('/api/status')
def get_status():
    """Get current scraping status"""
    return jsonify(scraping_state)


@app.route('/api/delete/<int:index>', methods=['DELETE'])
def delete_contact(index):
    """Delete a contact by index"""
    contacts = load_existing_data()
    
    if 0 <= index < len(contacts):
        deleted = contacts.pop(index)
        save_data(contacts)
        return jsonify({
            'success': True,
            'deleted': deleted
        })
    
    return jsonify({
        'success': False,
        'error': 'Invalid index'
    })


@app.route('/api/export')
def export_data():
    """Export data as JSON file"""
    contacts = load_existing_data()
    
    # Create export file
    export_path = os.path.join(os.path.dirname(__file__), 'export_data.json')
    with open(export_path, 'w', encoding='utf-8') as f:
        json.dump({'contacts': contacts}, f, indent=2, ensure_ascii=False)
    
    return send_file(
        export_path,
        as_attachment=True,
        download_name=f'contacts_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    )


@app.route('/api/add', methods=['POST'])
def add_contact():
    """Add a new contact manually"""
    data = request.get_json()
    name = data.get('name', '').strip()
    phone = data.get('phone', '').strip()
    
    if not name or not phone:
        return jsonify({
            'success': False,
            'error': 'Name and phone are required'
        })
    
    contacts = load_existing_data()
    contacts.append({
        'name': name,
        'phone': phone
    })
    save_data(contacts)
    
    return jsonify({
        'success': True,
        'message': 'Contact added'
    })


if __name__ == '__main__':
    print("🗺️ Google Maps Scraper Web Interface")
    print("=" * 50)
    print("Starting server at http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, port=5000)
