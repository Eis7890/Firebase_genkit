const express = require('express');
const app = express();
const port = 4000;

app.use(express.json());

app.post('/run/flow/HNSW Retriever', (req, res) => {
  const { prompt, indexPath } = req.body;
  // Process the input and generate a response
  const response = {
    message: `Received prompt: ${prompt} with indexPath: ${indexPath}`,
    result: 'Your RAG model response here'
  };
  res.json(response);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
