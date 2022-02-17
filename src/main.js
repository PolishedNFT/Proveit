const fs = require('fs');
const CryptoJS = require('crypto-js');
const { performance } = require('perf_hooks');
const axios = require('axios').default;
const { Buffer } = require('buffer');

function getImportDir() {
	const arg = process.argv[2];
	const lastChar = arg[arg.length - 1];

	if (lastChar === '/' && arg.length > 1) {
		return arg.slice(0, arg.length - 1);
	}

	return arg;
}

async function loadManifest(filePath) {
	const content = await fs.promises.readFile(filePath);
	return JSON.parse(content);
}

function getCid(str) {
	return str.split('/').filter(m => m.length === 59).pop();
}

async function main() {
	console.log(`Proveit [v1.0.0]`);
	console.log('---------------------------------');

	const startTime = performance.now();

	if (process.argv.length !== 3) {
		console.log('[!] Missing import path');
		console.log('[?] Usage: npm run start /path/to/import/output/');
		return;
	}

	const importDir = getImportDir();
	const manifest = await loadManifest(`${importDir}/manifest.json`);
	if (!manifest || !manifest.metadata) {
		console.log('[!] Failed to load manifest file');
		return;
	}

	const config = {
		total: manifest.total,
		baseUri: manifest.baseUri,
		provenanceHash: manifest.provenanceHash,
	};

	const ipfsGateway = 'https://ipfs.io/ipfs/';

	const hashes = [];

	console.log('[@] Proving hash...');

	for (let tokenId = 0; tokenId < config.total; tokenId++) {
		const metadata = await axios.get(`${ipfsGateway}${getCid(config.baseUri)}/${tokenId}`).then(res => res.data);
		const imageUrl = `${ipfsGateway}${getCid(metadata.image)}/${tokenId}.png`;
		const imageBytes = await axios({
			url: imageUrl,
			method: 'GET',
			timeout: 25000,
			responseType: 'arraybuffer',
		}).then(res => Buffer.from(res.data, 'binary').toString('hex'));
	
		const hash = CryptoJS.SHA256(CryptoJS.enc.Hex.parse(imageBytes)).toString();
		if (hash !== metadata.hash) {
			throw new Error(`[!] IMAGE HASH DOES NOT MATCH METADATA HASH!!! (${imageUrl}) [${hash} !== ${metadata.hash}]`);
		}

		console.log(`[+] Hashed ${tokenId}.png: ${hash}`);
		hashes.push(hash);
	}

	const concatedHashes = hashes.join('');

	console.log(`[#] Concatenated hashes: ${concatedHashes}`);

	const provenanceHash = CryptoJS.SHA256(concatedHashes).toString();

	console.log(`[#] Hashed Provenance: ${provenanceHash}`);

	const proof = config.provenanceHash === provenanceHash;

	const endTime = (Math.abs(performance.now() - startTime) / 1000).toFixed(4);

	if (!proof) {
		throw new Error(`[!] PROVENANCE HASH DID NOT MATCH!!! (${config.provenanceHash} !== ${provenanceHash})`);
	}

	console.log(`[#] Proved hashes matched in: ${endTime}s`);
	console.log(`[$] Provenance Hash Matches: ${config.provenanceHash} === ${provenanceHash}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
