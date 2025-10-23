const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying LocationLockedVault contract...\n");

  // Get the contract factory
  const LocationLockedVault = await hre.ethers.getContractFactory("LocationLockedVault");
  
  console.log("📝 Deploying contract to network:", hre.network.name);
  
  // Deploy the contract
  const contract = await LocationLockedVault.deploy();
  
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  
  console.log("\n✅ LocationLockedVault deployed successfully!");
  console.log("📍 Contract Address:", contractAddress);
  console.log("🌐 Network:", hre.network.name);
  console.log("⛓️  Chain ID:", hre.network.config.chainId);
  
  // Save contract address and ABI
  const contractData = {
    address: contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployedAt: new Date().toISOString()
  };

  // Save deployment info
  const deploymentPath = path.join(__dirname, "../contracts/deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(contractData, null, 2));
  console.log("\n💾 Deployment info saved to:", deploymentPath);

  // Copy ABI to contracts folder
  const artifactPath = path.join(__dirname, "../artifacts/contracts/LocationLockedVault.sol/LocationLockedVault.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const abiPath = path.join(__dirname, "../contracts/LocationLockedVault.json");
  fs.writeFileSync(abiPath, JSON.stringify(artifact, null, 2));
  console.log("💾 Contract ABI saved to:", abiPath);

  // Update .env file suggestion
  console.log("\n" + "=".repeat(80));
  console.log("📋 NEXT STEPS:");
  console.log("=".repeat(80));
  console.log("\n1. Update your .env file with the following:");
  console.log(`\n   CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   RPC_URL=${hre.network.config.url || 'https://rpc-amoy.polygon.technology'}`);
  console.log(`   PRIVATE_KEY=<your_wallet_private_key>`);
  console.log(`   PINATA_API_KEY=<your_pinata_api_key>`);
  console.log(`   PINATA_API_SECRET=<your_pinata_api_secret>`);
  console.log(`   PORT=5000`);
  console.log(`   NODE_ENV=development`);
  
  console.log("\n2. Verify the contract on PolygonScan (optional):");
  console.log(`   npx hardhat verify --network amoy ${contractAddress}`);
  
  console.log("\n3. Start the backend with blockchain integration:");
  console.log(`   node index.js`);
  
  console.log("\n" + "=".repeat(80));
  console.log("🎉 Deployment complete!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

