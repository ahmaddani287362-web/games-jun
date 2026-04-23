// api/proxy.js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwJcLSSs0GzApLHZpf-CYiw4Y_IPzK-zr5Ct7mBQXhZEoS0iLlcnBx-8wPsiq4j49qQ/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    let url = APPS_SCRIPT_URL;
    let options = {};
    
    if (req.method === 'DELETE') {
      const { id } = req.query;
      url = `${APPS_SCRIPT_URL}?id=${id}`;
      options = { method: 'DELETE' };
    }
    
    if (req.method === 'POST' || req.method === 'PUT') {
      options = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      };
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    res.status(200).json(data);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
