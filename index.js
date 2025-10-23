import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs';
import cors from 'cors';
import FormData from 'form-data';
// Try to load LocationLockedVault.json first, fallback to BlockVault.json
let contractJson;
try {
  contractJson = JSON.parse(fs.readFileSync('./contracts/LocationLockedVault.json', 'utf8'));
  console.log('✅ Using LocationLockedVault contract (with location features)');
} catch (err) {
  console.log('⚠️  LocationLockedVault.json not found, falling back to BlockVault.json');
  contractJson = JSON.parse(fs.readFileSync('./contracts/BlockVault.json', 'utf8'));
}

const contractABI = contractJson.abi;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);


const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

const getFileHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  return ethers.keccak256(new Uint8Array(fileBuffer));
};

async function uploadToPinata(filepath, filename) {
  const url =`https://api.pinata.cloud/pinning/pinFileToIPFS`;
  const data = new FormData();
  data.append('file', fs.createReadStream(filepath), filename);

  const res = await axios.post(url, data, {
    maxBodyLength: Infinity,
    headers: {
      ...data.getHeaders(),
      'pinata_api_key': process.env.PINATA_API_KEY,
      'pinata_secret_api_key': process.env.PINATA_API_SECRET
    }
  });
  return res.data.IpfsHash;
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const walletAddress = req.body.walletAddress;
    const signature = req.body.signature;
    const hasLocationLock = req.body.hasLocationLock === 'true';
    const latitude = req.body.latitude ? parseInt(req.body.latitude * 1000000) : 0; // Convert to micro-degrees
    const longitude = req.body.longitude ? parseInt(req.body.longitude * 1000000) : 0; // Convert to micro-degrees
    const radius = req.body.radius ? parseInt(req.body.radius) : 100; // Default 100 meters

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!walletAddress || !signature) return res.status(400).json({ error: 'Missing wallet address or signature' });

    const fileHash = getFileHash(file.path);

    // Log debug info
    console.log("Params for uploadFile:", { 
      fileHash, 
      ipfsCID: "(TBD)", 
      signature, 
      hasLocationLock, 
      latitude, 
      longitude, 
      radius 
    });

    const ipfsCID = await uploadToPinata(file.path, file.originalname);

    // Log more debug info
    console.log("About to call contract.uploadFile", { 
      fileHash, 
      ipfsCID, 
      signature, 
      hasLocationLock, 
      latitude, 
      longitude, 
      radius 
    });

    const tx = await contract.uploadFile(
      fileHash, 
      ipfsCID, 
      signature, 
      hasLocationLock, 
      latitude, 
      longitude, 
      radius
    );
    await tx.wait();

    fs.unlinkSync(file.path);

    res.json({
      status: "success",
      txHash: tx.hash,
      fileHash,
      ipfsCID,
      hasLocationLock,
      latitude: latitude / 1000000, // Convert back to degrees
      longitude: longitude / 1000000, // Convert back to degrees
      radius
    });
  } catch (err) {
    console.error(err);

    let errorMsg = "Upload failed";
    if (err.reason) {
      errorMsg += ": " + err.reason;
    } else if (err.error && err.error.message) {
      errorMsg += ": " + err.error.message;
    } else if (err.message) {
      errorMsg += ": " + err.message;
    }

    res.status(500).json({ error: errorMsg, details: err.stack });
  }
});

app.listen(PORT, () => {
  console.log(`BlockVault backend running on port ${PORT}`);
});

// Add to your index.js, after the other routes
app.get('/getFile/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    // Returns: (uploader, ipfsCID, signature, timestamp, hasLocationLock, latitude, longitude, radius)
    const record = await contract.getFileRecord(hash);
    
    // Check if this is the new contract with location features
    const hasLocationFeatures = record.length >= 8 || record.hasLocationLock !== undefined;
    
    const response = {
      uploader: record.uploader || record[0],
      ipfsCID: record.ipfsCID || record[1],
      signature: record.signature || record[2],
      timestamp: Number(record.timestamp || record[3])
    };
    
    // Add location data if available
    if (hasLocationFeatures) {
      response.hasLocationLock = record.hasLocationLock || record[4] || false;
      response.latitude = Number(record.latitude || record[5] || 0) / 1000000; // Convert from micro-degrees
      response.longitude = Number(record.longitude || record[6] || 0) / 1000000;
      response.radius = Number(record.radius || record[7] || 100);
    }
    
    res.json(response);
  } catch (err) {
    res.json({});
  }
});

app.get("/auditTrail", async (req, res) => {
  try {
    const latestBlock = await provider.getBlockNumber();
    
    // Try new event signature first (with location), fallback to old signature
    let eventSignature = "FileUploaded(bytes32,address,string,bytes,uint256,bool,int32,int32,uint32)";
    let eventTopic = ethers.id(eventSignature);

    let events = [];
    const batchSize = 500;
    let fromBlock = Math.max(0, latestBlock - 5000); // last 5000 blocks
    let toBlock = latestBlock;

    for (let start = fromBlock; start <= toBlock; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toBlock);
      const batchLogs = await provider.getLogs({
        address: contract.target || contract.address,
        fromBlock: start,
        toBlock: end,
        topics: [eventTopic]
      });

      batchLogs.forEach(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          const event = {
            fileHash: parsed.args.fileHash,
            uploader: parsed.args.uploader,
            ipfsCID: parsed.args.ipfsCID,
            signature: parsed.args.signature,
            timestamp: Number(parsed.args.timestamp),
            txHash: log.transactionHash
          };
          
          // Add location data if available
          if (parsed.args.hasLocationLock !== undefined) {
            event.hasLocationLock = parsed.args.hasLocationLock;
            event.latitude = Number(parsed.args.latitude || 0) / 1000000;
            event.longitude = Number(parsed.args.longitude || 0) / 1000000;
            event.radius = Number(parsed.args.radius || 100);
          }
          
          events.push(event);
        } catch (parseErr) {
          console.error('Error parsing log:', parseErr);
        }
      });
    }

    // Sort most recent first
    events.sort((a, b) => b.timestamp - a.timestamp);

    res.json({ status: "success", data: events.slice(0, 50) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit trail", details: err.message });
  }
});

app.post('/grantAccess', async (req, res) => {
  try {
    const { fileHash, grantee } = req.body;
    if (!fileHash || !grantee) return res.status(400).json({ error: "Missing fileHash or grantee address" });
    const tx = await contract.grantAccess(fileHash, grantee);
    await tx.wait();
    res.json({ status: "success", txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: "Grant access failed", details: err.message });
  }
});

// Revoke Access
app.post('/revokeAccess', async (req, res) => {
  try {
    const { fileHash, grantee } = req.body;
    if (!fileHash || !grantee) return res.status(400).json({ error: "Missing fileHash or grantee address" });
    const tx = await contract.revokeAccess(fileHash, grantee);
    await tx.wait();
    res.json({ status: "success", txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: "Revoke access failed", details: err.message });
  }
});

// Can Access (status)
app.get('/canAccess/:fileHash/:address', async (req, res) => {
  try {
    const { fileHash, address } = req.params;
    const canAccess = await contract.canAccess(fileHash, address);
    res.json({ fileHash, address, canAccess });
  } catch (err) {
    res.status(500).json({ error: "Access check failed", details: err.message });
  }
});

// Verify Location
app.post('/verifyLocation', async (req, res) => {
  try {
    const { fileHash, latitude, longitude } = req.body;
    if (!fileHash || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "Missing fileHash, latitude, or longitude" });
    }

    // Convert to micro-degrees for contract
    const latMicro = parseInt(latitude * 1000000);
    const lonMicro = parseInt(longitude * 1000000);

    const isValidLocation = await contract.verifyLocation(fileHash, latMicro, lonMicro);
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