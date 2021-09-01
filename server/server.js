/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

require('dotenv').config();
const GRPC = process.env.GRPC;
let success = 0;
let fail = 0;
let count = 0;
const assetCount = process.env.ASSET_COUNT;

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('../test-application/javascript/CAUtil.js');
const { buildCCPOrg, buildWallet } = require('../test-application/javascript/AppUtil.js');

const caHost = `ca.org${GRPC}.example.com`;
const department = `org${GRPC}.department1`;
const mspOrg = `Org${GRPC}MSP`;
const channelName = 'mychannel';
const chaincodeName = 'basic';
const walletPath = path.join(__dirname, 'wallet');
const orgUserId = 'appUser';

console.log(`Starting Fabric Server ${GRPC}...\ncaHost:${caHost}\ndepartment:${department}\nmspOrg:${mspOrg}\n`)

function prettyJSONString(inputString) {
	return JSON.stringify(JSON.parse(inputString), null, 2);
}

// pre-requisites:
// - fabric-sample two organization test-network setup with two peers, ordering service,
//   and 2 certificate authorities
//         ===> from directory /fabric-samples/test-network
//         ./network.sh up createChannel -ca
// - Use any of the asset-transfer-basic chaincodes deployed on the channel "mychannel"
//   with the chaincode name of "basic". The following deploy command will package,
//   install, approve, and commit the javascript chaincode, all the actions it takes
//   to deploy a chaincode to a channel.
//         ===> from directory /fabric-samples/test-network
//         ./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-javascript/ -ccl javascript
// - Be sure that node.js is installed
//         ===> from directory /fabric-samples/asset-transfer-basic/application-javascript
//         node -v
// - npm installed code dependencies
//         ===> from directory /fabric-samples/asset-transfer-basic/application-javascript
//         npm install
// - to run this test application
//         ===> from directory /fabric-samples/asset-transfer-basic/application-javascript
//         node app.js

// NOTE: If you see  kind an error like these:
/*
    2020-08-07T20:23:17.590Z - error: [DiscoveryService]: send[mychannel] - Channel:mychannel received discovery error:access denied
    ******** FAILED to run the application: Error: DiscoveryService: mychannel error: access denied
   OR
   Failed to register user : Error: fabric-ca request register failed with errors [[ { code: 20, message: 'Authentication failure' } ]]
   ******** FAILED to run the application: Error: Identity not found in wallet: appUser
*/
// Delete the /fabric-samples/asset-transfer-basic/application-javascript/wallet directory
// and retry this application.
//
// The certificate authority must have been restarted and the saved certificates for the
// admin and application user are not valid. Deleting the wallet store will force these to be reset
// with the new certificate authority.
//

/**
 *  A test application to show basic queries operations with any of the asset-transfer-basic chaincodes
 *   -- How to submit a transaction
 *   -- How to query and check the results
 *
 * To see the SDK workings, try setting the logging to show on the console before running
 *        export HFC_LOGGING='{"debug":"console"}'
 */
async function getCC() {
	try {
		// build an in memory object with the network configuration (also known as a connection profile)
		const ccp = buildCCPOrg(GRPC.toString());

		// build an instance of the fabric ca services client based on
		// the information in the network configuration
		const caClient = buildCAClient(FabricCAServices, ccp, caHost);

		// setup the wallet to hold the credentials of the application user
		const wallet = await buildWallet(Wallets, walletPath);

		// in a real application this would be done on an administrative flow, and only once
		await enrollAdmin(caClient, wallet, mspOrg);

		// in a real application this would be done only when a new user was required to be added
		// and would be part of an administrative flow
		await registerAndEnrollUser(caClient, wallet, mspOrg, orgUserId, department);

		// Create a new gateway instance for interacting with the fabric network.
		// In a real application this would be done as the backend server session is setup for
		// a user that has been verified.
		const gateway = new Gateway();

        // setup the gateway instance
        // The user will now be able to create connections to the fabric network and be able to
        // submit transactions and query. All transactions submitted by this gateway will be
        // signed by this user using the credentials stored in the wallet.
        await gateway.connect(ccp, {
            wallet,
            identity: orgUserId,
            discovery: { enabled: true, asLocalhost: true } // using asLocalhost as this gateway is using a fabric network deployed locally
        });

        // Build a network instance based on the channel where the smart contract is deployed
        const network = await gateway.getNetwork(channelName);

        // let org1Endorser = network.getChannel().getEndorser("peer0.org1.example.com:7051");
        // let org2Endorser = network.getChannel().getEndorser("peer0.org2.example.com:9051");

        // Get the contract from the network.
        const contract = network.getContract(chaincodeName);
        return gateway, contract;

    } catch (error) {
		console.error(`******** FAILED to run connect fabric network: ${error}`);
        return error;
	}
}

async function getAsset(res, contract, assetId, endoreser) {
    try {
        console.log(`\n--> [1] Evaluate Transaction: ReadAsset, function returns "asset1" attributes`);
        let result = await contract.evaluateTransaction('ReadAsset', assetId);
        // console.log(`*** Result: ${prettyJSONString(result.toString())}`);
        res.code(200)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ result: result.toString() });
    } catch (error) {
        console.error(`******** FAILED to run the application: ${error}`);
        res.code(503)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ result: error })
        return error;
    }
}

async function transferAsset(res, contract, endoreser) {
    try {
        const assetId = `asset1${GRPC}${Math.floor(Math.random() * assetCount + 1).toString()}`;
        console.log(`\n--> [${GRPC}] Submit Transaction: TransferAsset ${assetId}, transfer to new owner`);
        await contract.submitTransaction('TransferAsset', assetId, 'Bob');
        // await contract.createTransaction('TransferAsset').setEndorsingPeers([org1Endorser, org2Endorser]).submit('asset1', 'Alice');
        // console.log('*** Result: Transaction commited');
        res.code(200)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ result: 'commited' });
        success += 1;
    } catch (error) {
        console.error(`******** FAILED to run the application: ${error}`);
        res.code(503)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ result: error })
        fail += 1;
        return error;
    }
}

async function createAsset(contract, assetId, color, size, owner, appraisedValue, endoreser) {
    try {
        console.log(`\n--> [${GRPC}] Submit Transaction: CreateAsset ${assetId}`);
        await contract.submitTransaction('CreateAsset', assetId, color, size, owner, appraisedValue);
        // await contract.createTransaction('TransferAsset').setEndorsingPeers([org1Endorser, org2Endorser]).submit('asset1', 'Alice');
        // console.log('*** Result: Transaction commited');
    } catch (error) {
        console.error(`******** FAILED to run the application: ${error}`);
        return error;
    }
}

async function disconnect(gateway){
    try{
        gateway.disconnect();
        return null;
    } catch (error) {
        console.error(`******** FAILED to disconnect fabric network: ${error}`);
        return error;
    }
}

async function main(){
    let gateway;
    let contract;
    gateway, contract = await getCC();

    for (let i = 1; i <= assetCount; i++) {
        await createAsset(contract, `asset1${GRPC}${i.toString()}`, 'red', `${i}`, 'Alice', `${100 + i}`);
    }

    const server = require('fastify')();

    server.get('/getAsset/:assetId', function (req, res) {
        return getAsset(res, contract, req.params.assetId);
    });

    // server.get('/transferAsset/:endoreser/:assetId/:owner', function (req, res) {
    //     console.log(req.params.endoreser)
    //     console.log(req.params.assetId)
    //     console.log(req.params.owner)
    //     return sendTransaction(contract, 'transferAsset', req.params.endoreser, req.params.assetId, req.params.owner);

    // });

    server.get('/transferAsset', function (req, res) {
        count += 1;
        transferAsset(res, contract);
    });

    server.get('/status', function (req, res) {
        return {"success": success, "fail": fail, "count": count};
    });

    server.get('/down', function (req, res) {
        const err = disconnect(gateway);
        if (err != null) {
            return {"status": err };
        }
        return {"status": "OK"};
    });

    server.listen(3000 + Number(GRPC), "127.0.0.1");
    console.log(`Server is running on 127.0.0.1:300${GRPC}...`)
}

main();