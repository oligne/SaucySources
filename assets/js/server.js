const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.json());

const GITHUB_TOKEN = 'TON_TOKEN_ICI';
const REPO = 'tonuser/tonrepo';
const FILEPATH = 'assets/library.json'; // chemin dans le repo
const BRANCH = 'main';

app.post('/update', async (req, res) => {
  const newContent = JSON.stringify(req.body, null, 2);

  // 1. Get current file SHA
  const resp = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILEPATH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  const file = await resp.json();

  // 2. Commit new content
  const commitResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILEPATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Update library.json via API',
      content: Buffer.from(newContent).toString('base64'),
      sha: file.sha,
      branch: BRANCH
    })
  });

  if (commitResp.ok) res.json({ ok: true });
  else res.status(500).json({ error: await commitResp.text() });
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));