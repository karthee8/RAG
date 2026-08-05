const fetch = require('node-fetch');

async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({conversationId: 'test', content: 'hello', speed: 'fast'})
    });
    const text = await res.text();
    console.log(text);
  } catch(e) {
    console.error(e);
  }
}
run();
