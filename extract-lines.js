const fs = require('fs');

const fullLogPath = 'C:\\Users\\rangg\\.gemini\\antigravity\\brain\\6e2f794b-0b15-4630-8aa4-52130a061e11\\.system_generated\\logs\\transcript_full.jsonl';

try {
  const content = fs.readFileSync(fullLogPath, 'utf8');
  const lines = content.split('\n');
  
  // Let's print line 1913 untruncated (JSON parsed)
  const line1913 = JSON.parse(lines[1913]);
  console.log('--- LINE 1913 ---');
  // Find where the code was written in tool_calls
  const toolCall = line1913.tool_calls.find(t => t.name === 'write_to_file' || t.name === 'replace_file_content');
  if (toolCall) {
    console.log(JSON.stringify(toolCall.args, null, 2));
  } else {
    console.log(JSON.stringify(line1913, null, 2));
  }
} catch (err) {
  console.error(err.message);
}
