const fs = require('fs');

const fullLogPath = 'C:\\Users\\rangg\\.gemini\\antigravity\\brain\\6e2f794b-0b15-4630-8aa4-52130a061e11\\.system_generated\\logs\\transcript_full.jsonl';

try {
  const content = fs.readFileSync(fullLogPath, 'utf8');
  const lines = content.split('\n');
  
  // Parse line 1913 which contains the previous model's code edit
  const data = JSON.parse(lines[1913]);
  console.log('--- RAW STEP 1913 ---');
  // Let's print the tool calls or content where the Apps Script code was proposed
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error(err.message);
}
