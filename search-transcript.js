const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\rangg\\.gemini\\antigravity\\brain\\6e2f794b-0b15-4630-8aa4-52130a061e11\\.system_generated\\logs\\transcript.jsonl';

try {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  let found = false;
  
  console.log(`Searching transcript.jsonl (${lines.length} lines)...`);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('SpreadsheetApp.getActiveSpreadsheet()') && lines[i].includes('doGet')) {
      console.log(`Found match at line ${i}:`);
      console.log(lines[i].substring(0, 1000));
      found = true;
    }
  }
  if (!found) {
    console.log('No exact match. Printing lines containing doGet...');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('doGet')) {
        console.log(`Line ${i}:`, lines[i].substring(0, 500));
      }
    }
  }
} catch (err) {
  console.error('Error reading transcript:', err.message);
}
