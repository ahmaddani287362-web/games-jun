// api/proxy.js - SIMPLIFIED VERSION
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxJPjxi3ek4YrJZ0WKSQAkfK47JkWIuqeupx2fgpso1oTbKdFC9gZlCdi6OLPNssv3f/exec';
  
  try {
    let targetUrl = APPS_SCRIPT_URL;
    let fetchOptions = { method: req.method };
    
    // Untuk DELETE, tambahkan parameter
    if (req.method === 'DELETE') {
      targetUrl = `${APPS_SCRIPT_URL}?id=${req.query.id}`;
    }
    
    // Untuk POST/PUT, tambahkan body
    if (req.method === 'POST' || req.method === 'PUT') {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(req.body);
    }
    
    const response = await fetch(targetUrl, fetchOptions);
    const result = await response.json();
    
    return res.status(200).json(result);
    
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
