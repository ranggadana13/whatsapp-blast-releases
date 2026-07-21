const fs = require('fs');

const fullLogPath = 'C:\\Users\\rangg\\.gemini\\antigravity\\brain\\6e2f794b-0b15-4630-8aa4-52130a061e11\\.system_generated\\logs\\transcript_full.jsonl';

try {
  const content = fs.readFileSync(fullLogPath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`Scanning all ${lines.length} lines of history for Google Apps Script code...`);
  
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // We want to find a model response containing function doPost
    if (lines[i].includes('function doPost') && lines[i].includes('"source":"MODEL"')) {
      const step = JSON.parse(lines[i]);
      console.log(`\n======================================================`);
      console.log(`FOUND STEP INDEX: ${step.step_index} (Line ${i})`);
      console.log(`======================================================`);
      
      // Look in content
      if (step.content) {
        console.log('--- Content ---');
        console.log(step.content.substring(0, 1500));
      }
      
      // Look in tool_calls
      if (step.tool_calls) {
        for (const tc of step.tool_calls) {
          if (tc.name === 'write_to_file' || tc.name === 'replace_file_content') {
            console.log(`--- Tool Call ${tc.name} for ${tc.args.TargetFile || tc.args.TargetFile} ---`);
            const code = tc.args.CodeContent || tc.args.ReplacementContent;
            if (code && code.includes('function doPost')) {
              console.log(code);
            }
          }
        }
      }
    }
  }
} catch (err) {
  console.error(err.message);
}
