"""
Enhanced ticker master file preparation with multiple data sources and validation.
Downloads and processes ticker data from NASDAQ, NYSE, and other sources.
"""

import pandas as pd
import requests
from pathlib import Path
from typing import Set, List, Dict
import config

def download_nasdaq_listed() -> pd.DataFrame:
    """Download NASDAQ listed securities"""
    url = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
    try:
        print("📡 Downloading NASDAQ listings...")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Parse the pipe-delimited file
        lines = response.text.strip().split('\n')
        
        # Find header line and data lines
        header_line = None
        data_lines = []
        
        for line in lines:
            if '|' in line and 'Symbol' in line:
                header_line = line
            elif '|' in line and not line.startswith('File Creation Time'):
                data_lines.append(line)
        
        if not header_line or not data_lines:
            raise ValueError("Could not parse NASDAQ data")
        
        # Convert to DataFrame
        headers = [h.strip() for h in header_line.split('|')]
        data = []
        
        for line in data_lines:
            fields = [f.strip() for f in line.split('|')]
            if len(fields) >= len(headers):
                data.append(fields[:len(headers)])
        
        df = pd.DataFrame(data, columns=headers)
        print(f"✅ Downloaded {len(df)} NASDAQ listings")
        return df
        
    except Exception as e:
        print(f"⚠️ Failed to download NASDAQ data: {e}")
        return pd.DataFrame()

def download_nyse_listed() -> pd.DataFrame:
    """Download NYSE listed securities - using alternative source"""
    # NYSE doesn't have a simple API, so we'll use a backup approach
    print("⚠️ NYSE direct download not available - using fallback method")
    
    # You can manually download from: https://www.nyse.com/listings_directory/stock
    # and place in data/nyse-listed.csv
    
    nyse_file = config.DATA_DIR / "nyse-listed.csv"
    if nyse_file.exists():
        try:
            return pd.read_csv(nyse_file)
        except Exception as e:
            print(f"⚠️ Error
