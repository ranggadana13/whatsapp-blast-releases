const fs = require('fs');

const logPath = 'C:\\Users\\rangg\\.gemini\\antigravity\\brain\\6e2f794b-0b15-4630-8aa4-52130a061e11\\.system_generated\\logs\\transcript.jsonl';
const fullLogPath = 'C:\\Users\\rangg\\.gemini\\antigravity\\brain\\6e2f794b-0b15-4630-8aa4-52130a061e11\\.system_generated\\logs\\transcript_full.jsonl';

function searchFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    console.log(`Searching ${filePath} (${lines.length} lines)...`);
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('function doPost') && lines[i].includes('SpreadsheetApp')) {
        console.log(`\n--- Match in ${filePath} at line ${i} ---`);
        // Find if we have code blocks
        const matches = lines[i].match(/function doPost\(e\)[\s\S]{1,5000}/);
        if (matches) {
          console.log(matches[0].substring(0, 1500));
        } else {
          console.log(lines[i].substring(0, 1000));
        }
      }
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
}

searchFile(logPath);
searchFile(fullLogPath);
