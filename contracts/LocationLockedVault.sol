// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title LocationLockedVault
 * @dev Blockchain-based document verification with location-based access control
 * @notice This contract stores file records with optional geolocation locks
 */
contract LocationLockedVault {
    
    struct FileRecord {
        address uploader;
        string ipfsCID;
        bytes signature;
        uint256 timestamp;
        bool hasLocationLock;
        int32 latitude;      // Stored as micro-degrees (e.g., 34.052235 * 1,000,000)
        int32 longitude;     // Stored as micro-degrees
        uint32 radius;       // Verification radius in meters
    }

    // Mapping from file hash to file record
    mapping(bytes32 => FileRecord) public fileRecords;
    
    // Access control mapping: fileHash => address => hasAccess
    mapping(bytes32 => mapping(address => bool)) public accessControl;

    // Events
    event FileUploaded(
        bytes32 indexed fileHash,
        address indexed uploader,
        string ipfsCID,
        bytes signature,
        uint256 timestamp,
        bool hasLocationLock,
        int32 latitude,
        int32 longitude,
        uint32 radius
    );
    
    event AccessGranted(bytes32 indexed fileHash, address indexed grantee);
    event AccessRevoked(bytes32 indexed fileHash, address indexed grantee);

    /**
     * @dev Upload a file record to the blockchain
     * @param fileHash Keccak256 hash of the file content
     * @param ipfsCID IPFS Content Identifier where the file is stored
     * @param signature Digital signature of the file hash
     * @param hasLocationLock Whether this file has location-based verification
     * @param latitude Latitude in micro-degrees (multiply by 1,000,000)
     * @param longitude Longitude in micro-degrees (multiply by 1,000,000)
     * @param radius Verification radius in meters
     */
    function uploadFile(
        bytes32 fileHash,
        string memory ipfsCID,
        bytes memory signature,
        bool hasLocationLock,
        int32 latitude,
        int32 longitude,
        uint32 radius
    ) public {
        require(fileRecords[fileHash].uploader == address(0), "File already uploaded");
        require(bytes(ipfsCID).length > 0, "IPFS CID cannot be empty");

        fileRecords[fileHash] = FileRecord({
            uploader: msg.sender,
            ipfsCID: ipfsCID,
            signature: signature,
            timestamp: block.timestamp,
            hasLocationLock: hasLocationLock,
            latitude: latitude,
            longitude: longitude,
            radius: radius
        });

        // Uploader always has access
        accessControl[fileHash][msg.sender] = true;

        emit FileUploaded(
            fileHash,
            msg.sender,
            ipfsCID,
            signature,
            block.timestamp,
            hasLocationLock,
            latitude,
            longitude,
            radius
        );
    }

    /**
     * @dev Get file record by hash
     * @param fileHash The hash of the file to retrieve
     * @return uploader Address of the uploader
     * @return ipfsCID IPFS Content Identifier
     * @return signature Digital signature
     * @return timestamp Upload timestamp
     * @return hasLocationLock Whether location lock is enabled
     * @return latitude Location latitude in micro-degrees
     * @return longitude Location longitude in micro-degrees
     * @return radius Verification radius in meters
     */
    function getFileRecord(bytes32 fileHash)
        public
        view
        returns (
            address uploader,
            string memory ipfsCID,
            bytes memory signature,
            uint256 timestamp,
            bool hasLocationLock,
            int32 latitude,
            int32 longitude,
            uint32 radius
        )
    {
        FileRecord storage record = fileRecords[fileHash];
        return (
            record.uploader,
            record.ipfsCID,
            record.signature,
            record.timestamp,
            record.hasLocationLock,
            record.latitude,
            record.longitude,
            record.radius
        );
    }

    /**
     * @dev Verify if a location is within the allowed radius
     * @param fileHash Hash of the file to verify
     * @param currentLatitude Current latitude in micro-degrees
     * @param currentLongitude Current longitude in micro-degrees
     * @return isValid Whether the current location is within the allowed radius
     */
    function verifyLocation(
        bytes32 fileHash,
        int32 currentLatitude,
        int32 currentLongitude
    ) public view returns (bool isValid) {
        FileRecord storage record = fileRecords[fileHash];
        require(record.uploader != address(0), "File not found");
        
        if (!record.hasLocationLock) {
            return true; // No location lock, always valid
        }

        // Calculate distance using Haversine formula
        uint256 distance = calculateDistance(
            record.latitude,
            record.longitude,
            currentLatitude,
            currentLongitude
        );

        return distance <= uint256(record.radius);
    }

    /**
     * @dev Calculate distance between two GPS coordinates using Haversine formula
     * @param lat1 First latitude in micro-degrees
     * @param lon1 First longitude in micro-degrees
     * @param lat2 Second latitude in micro-degrees
     * @param lon2 Second longitude in micro-degrees
     * @return distance Distance in meters
     */
    function calculateDistance(
        int32 lat1,
        int32 lon1,
        int32 lat2,
        int32 lon2
    ) internal pure returns (uint256 distance) {
        // Earth's radius in meters
        int256 R = 6371000;

        // Convert micro-degrees to radians (approximately)
        // We use fixed-point arithmetic to avoid floating point
        int256 lat1Rad = (int256(lat1) * 314159) / (180000000); // π/180 ≈ 0.0174533
        int256 lon1Rad = (int256(lon1) * 314159) / (180000000);
        int256 lat2Rad = (int256(lat2) * 314159) / (180000000);
        int256 lon2Rad = (int256(lon2) * 314159) / (180000000);

        int256 dLat = lat2Rad - lat1Rad;
        int256 dLon = lon2Rad - lon1Rad;

        // Haversine formula (simplified for Solidity)
        // For small distances, we can use a simpler approximation
        int256 x = dLon * cos(lat1Rad / 1000000) / 1000000;
        int256 y = dLat;
        
        int256 distanceSquared = (x * x + y * y);
        
        // Approximate square root
        uint256 dist = uint256(sqrt(distanceSquared) * R / 1000000);
        
        return dist;
    }

    /**
     * @dev Simple cosine approximation (Taylor series first terms)
     */
    function cos(int256 x) internal pure returns (int256) {
        // cos(x) ≈ 1 - x²/2 + x⁴/24 (first three terms of Taylor series)
        int256 x2 = (x * x) / 1000000;
        int256 x4 = (x2 * x2) / 1000000;
        return 1000000 - (x2 / 2) + (x4 / 24);
    }

    /**
     * @dev Integer square root using Babylonian method
     */
    function sqrt(int256 x) internal pure returns (int256) {
        if (x < 0) return 0;
        if (x == 0) return 0;
        
        int256 z = (x + 1) / 2;
        int256 y = x;
        
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        
        return y;
    }

    /**
     * @dev Grant access to a file for a specific address
     * @param fileHash Hash of the file
     * @param grantee Address to grant access to
     */
    function grantAccess(bytes32 fileHash, address grantee) public {
        require(fileRecords[fileHash].uploader == msg.sender, "Only uploader can grant access");
        require(grantee != address(0), "Invalid grantee address");
        
        accessControl[fileHash][grantee] = true;
        emit AccessGranted(fileHash, grantee);
    }

    /**
     * @dev Revoke access to a file for a specific address
     * @param fileHash Hash of the file
     * @param grantee Address to revoke access from
     */
    function revokeAccess(bytes32 fileHash, address grantee) public {
        require(fileRecords[fileHash].uploader == msg.sender, "Only uploader can revoke access");
        require(grantee != msg.sender, "Cannot revoke own access");
        
        accessControl[fileHash][grantee] = false;
        emit AccessRevoked(fileHash, grantee);
    }

    /**
     * @dev Check if an address has access to a file
     * @param fileHash Hash of the file
     * @param addr Address to check
     * @return hasAccess Whether the address has access
     */
    function canAccess(bytes32 fileHash, address addr) public view returns (bool hasAccess) {
        return accessControl[fileHash][addr];
    }

    /**
     * @dev Check if a file exists
     * @param fileHash Hash of the file to check
     * @return exists Whether the file exists
     */
    function fileExists(bytes32 fileHash) public view returns (bool exists) {
        return fileRecords[fileHash].uploader != address(0);
    }
}
