import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Mock data for local testing
const mockFiles = [];

// Mock upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const walletAddress = req.body.walletAddress;
    const signature = req.body.signature;
    const fileHash = req.body.fileHash; // Get the hash from frontend
    const hasLocationLock = req.body.hasLocationLock === 'true';
    const latitude = req.body.latitude ? parseFloat(req.body.latitude) : 0;
    const longitude = req.body.longitude ? parseFloat(req.body.longitude) : 0;
    const radius = req.body.radius ? parseInt(req.body.radius) : 100;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!walletAddress || !signature) return res.status(400).json({ error: 'Missing wallet address or signature' });
    if (!fileHash) return res.status(400).json({ error: 'Missing file hash' });

    console.log('Uploading file with hash:', fileHash);

    // Create mock file record
    const fileRecord = {
      fileHash: fileHash,
      uploader: walletAddress,
      ipfsCID: `Qm${Math.random().toString(36).substr(2, 46)}`,
      signature: signature,
      timestamp: Math.floor(Date.now() / 1000),
      hasLocationLock: hasLocationLock,
      latitude: latitude,
      longitude: longitude,
      radius: radius
    };

    mockFiles.push(fileRecord);
    console.log('Stored file record:', fileRecord);
    console.log('Total files in storage:', mockFiles.length);

    res.json({
      status: "success",
      txHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      fileHash: fileRecord.fileHash,
      ipfsCID: fileRecord.ipfsCID,
      hasLocationLock: hasLocationLock,
      latitude: latitude,
      longitude: longitude,
      radius: radius
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// Mock get file endpoint
app.get('/getFile/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    console.log('Looking for file with hash:', hash);
    console.log('Available hashes:', mockFiles.map(f => f.fileHash));
    
    const record = mockFiles.find(f => f.fileHash === hash);
    
    if (!record) {
      console.log('File not found');
      return res.json({});
    }

    console.log('File found:', record);
    res.json({
      uploader: record.uploader,
      ipfsCID: record.ipfsCID,
      signature: record.signature,
      timestamp: record.timestamp,
      hasLocationLock: record.hasLocationLock,
      latitude: record.latitude,
      longitude: record.longitude,
      radius: record.radius
    });
  } catch (err) {
    console.error('Error getting file:', err);
    res.json({});
  }
});

// Mock audit trail endpoint
app.get("/auditTrail", async (req, res) => {
  try {
    const events = mockFiles.map(file => ({
      fileHash: file.fileHash,
      uploader: file.uploader,
      ipfsCID: file.ipfsCID,
      signature: file.signature,
      timestamp: file.timestamp,
      hasLocationLock: file.hasLocationLock,
      latitude: file.latitude,
      longitude: file.longitude,
      radius: file.radius,
      txHash: `0x${Math.random().toString(16).substr(2, 64)}`
    }));

    // Sort most recent first
    events.sort((a, b) => b.timestamp - a.timestamp);

    res.json({ status: "success", data: events });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit trail", details: err.message });
  }
});

// Mock location verification endpoint
app.post('/verifyLocation', async (req, res) => {
  try {
    const { fileHash, latitude, longitude } = req.body;
    if (!fileHash || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Missing fileHash, latitude, or longitude" });
    }

    const record = mockFiles.find(f => f.fileHash === fileHash);
    
    if (!record || !record.hasLocationLock) {
      return res.json({ 
        fileHash, 
        latitude, 
        longitude, 
        isValidLocation: true 
      });
    }

    // Simple distance calculation (not accurate, just for demo)
    const latDiff = Math.abs(latitude - record.latitude);
    const lonDiff = Math.abs(longitude - record.longitude);
    const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111320; // Rough conversion to meters
    
    const isValidLocation = distance <= record.radius;

    res.json({ 
      fileHash, 
      latitude, 
      longitude, 
      isValidLocation 
    });
  } catch (err) {
    res.status(500).json({ error: "Location verification failed", details: err.message });
  }
});

// Mock access control endpoints
app.post('/grantAccess', async (req, res) => {
  res.json({ status: "success", txHash: `0x${Math.random().toString(16).substr(2, 64)}` });
});

app.post('/revokeAccess', async (req, res) => {
  res.json({ status: "success", txHash: `0x${Math.random().toString(16).substr(2, 64)}` });
});

app.get('/canAccess/:fileHash/:address', async (req, res) => {
  res.json({ fileHash: req.params.fileHash, address: req.params.address, canAccess: true });
});

app.listen(PORT, () => {
  console.log(`DocGuard Backend (Local Mode) running on port ${PORT}`);
  console.log('Note: This is running in local mode without blockchain integration');
  console.log('All data is stored in memory and will be lost when the server stops');
});
