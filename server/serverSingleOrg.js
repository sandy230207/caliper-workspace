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

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('../test-application/javascript/CAUtil.js');
const { buildCCPOrg1, buildWallet } = require('../test-application/javascript/AppUtil.js');

const caHost = `ca.org1.example.com`;
const department = `org1.department1`;
const mspOrg = `Org1MSP`;
const channelName = 'mychannel';
const chaincodeName = 'token_utxo';
const walletPath = path.join(__dirname, 'wallet');
const orgUserId1 = 'appUser1';
const orgUserId2 = 'appUser2';

let ccp;
let wallet;

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
async function enrollUsers() {
	try {
		// build an in memory object with the network configuration (also known as a connection profile)
		ccp = await buildCCPOrg1(GRPC.toString());

		// build an instance of the fabric ca services client based on
		// the information in the network configuration
		const caClient = buildCAClient(FabricCAServices, ccp, caHost);

		// setup the wallet to hold the credentials of the application user
		wallet = await buildWallet(Wallets, walletPath);

		// in a real application this would be done on an administrative flow, and only once
		await enrollAdmin(caClient, wallet, mspOrg);

		// in a real application this would be done only when a new user was required to be added
		// and would be part of an administrative flow
		await registerAndEnrollUser(caClient, wallet, mspOrg, orgUserId1, department);
        await registerAndEnrollUser(caClient, wallet, mspOrg, orgUserId2, department);
        return ccp, wallet

    } catch (error) {
		console.error(`******** FAILED to enroll users: ${error}`);
        return error;
	}
}

async function getCC(ccp, wallet, user) {
    try {
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
            identity: user,
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
        console.error(`******** FAILED to connect fabric network: ${error}`);
        return error;
    }
}

async function getClientID(contract) {
    try {
        const clientID = await contract.evaluateTransaction('ClientID');
        return clientID;
    } catch (error) {
        console.error(`******** FAILED to get client ID: ${error}`);
        return error;
    }
}

async function mint(contract, amount) {
    try {
        contract.submitTransaction('Mint', amount);
    } catch (error) {
        console.error(`******** FAILED to mint: ${error}`);
        return error;
    }
}

async function getUtxos(contract) {
    try {
        const utxos = await contract.evaluateTransaction('ClientUTXOs');
        return utxos;
    } catch (error) {
        console.error(`******** FAILED to get UTXOs of user: ${error}`);
        return error;
    }
}

async function sendTransaction(res, contract, func, fromUser, toID, endoreser, assetId, owner) {
    try {
        if (func == 'getAsset') {
            console.log(`\n--> [1] Evaluate Transaction: ReadAsset, function returns "asset1" attributes`);
            let result = await contract.evaluateTransaction('ReadAsset', 'asset1');
            // console.log(`*** Result: ${prettyJSONString(result.toString())}`);
            res.code(200)
                .header('Content-Type', 'application/json; charset=utf-8')
                .send({ result: result.toString() });
        } else if (func == 'transfer') {
            if (fromUser == orgUserId1){
                const utxos = await getUtxos(contract);
                console.log(`UTXOs of ${orgUserId1}: ${prettyJSONString(utxos)}\n`);
                
                const utxoInputKey = JSON.parse(utxos)[0].utxo_key;
                console.log(`utxoInputKey: ${utxoInputKey}\n`);
                console.log(typeof utxoInputKey === 'string');
                var utxoOutput1 = JSON.parse(utxos)[0];
                var utxoOutput2 = JSON.parse(utxos)[0];
                utxoOutput1.utxo_key = "";
                const outputAmount = utxoOutput1.amount - 1000;
                utxoOutput1.amount = outputAmount;
                utxoOutput2.utxo_key = "";
                utxoOutput2.owner = toID;
                utxoOutput2.amount = 1000;
                console.log(`Output utxo1:\n${utxoOutput1.amount}\n`);
                console.log(`Output utxo2:\n${utxoOutput2.amount}\n`);

                // let utxoInput = [];
                // utxoInput.push(utxoInputKey);
                // console.log("utxoInput", utxoInput);

                if (outputAmount > 0) {
                    console.log(`\n--> [${GRPC}] Submit Transaction: Transfer ${utxoInputKey} to user1 and user2`);
                    // await contract.submitTransaction('Transfer', utxoInput, [utxoOutput1, utxoOutput2]);
                    const result = await contract.submitTransaction('Transfer', [utxoInputKey], [utxoOutput1, utxoOutput2]);
                    console.log("result:", result);
                } else if (outputAmount = 0) {
                    console.log(`\n--> [${GRPC}] Submit Transaction: Transfer ${utxoInputKey} to user2`);
                    await contract.submitTransaction('Transfer', [utxoInputKey], [utxoOutput2]);
                }
            } else {
                // const utxos = await getUtxos(contract);
                // console.log(`UTXOs of ${orgUserId1}: ${prettyJSONString(utxos)}\n`);
                // const utxoInputs = JSON.parse(utxos);
                // console.log(`Transfer utxos[0]:\n${utxoInputs}\n`);
                // const utxoInputKeys = utxoInputs.utxo_key;
                // console.log(`utxos[0].utxo_key:\n${utxoInputKeys}\n`);
                // let utxoOutput1 = utxoInputs;
                // let utxoOutput2 = utxoInputs;
                // utxoOutput1.utxo_key = "";
                // utxoOutput1.amount = Number(utxoOutput1.amount) - 1000;
                // utxoOutput2.utxo_key = "";
                // utxoOutput2.owner = toID;
                // utxoOutput2.amount = 1000;
                // console.log(`Output utxo1:\n${utxoOutput1}\n`);
                // console.log(`Output utxo1:\n${utxoOutput2}\n`);

                // console.log(`\n--> [${GRPC}] Submit Transaction: TransferAsset ${utxoInputKey}, transfer to new owner`);
                // await contract.submitTransaction('Transfer', [utxoInputKeys], [utxoOutput1, utxoOutput2]);
            }
            res.code(200)
                .header('Content-Type', 'application/json; charset=utf-8')
                .send({ result: 'commited' });
        }
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
    ccp, wallet = await enrollUsers();

    let gateway1;
    let contract1;
    let gateway2;
    let contract2;
    gateway1, contract1 = await getCC(ccp, wallet, orgUserId1);
    gateway2, contract2 = await getCC(ccp, wallet, orgUserId2);

    const clientID1 = await getClientID(contract1);
    console.log(`clientID of ${orgUserId1}:\n${clientID1}\n`);
    const clientID2 = await getClientID(contract2);
    console.log(`clientID of ${orgUserId2}:\n${clientID2}\n`);

    // await mint(contract1, '5000');

    let utxos;
    utxos = await getUtxos(contract1);
    console.log(`UTXOs of ${orgUserId1}: ${prettyJSONString(utxos)}\n`);

    const server = require('fastify')();

    server.get('/getAsset', function (req, res) {
        return sendTransaction(res, contract1, 'getAsset');
    });

    // server.get('/transferAsset/:endoreser/:assetId/:owner', function (req, res) {
    //     console.log(req.params.endoreser)
    //     console.log(req.params.assetId)
    //     console.log(req.params.owner)
    //     return sendTransaction(contract, 'transferAsset', req.params.endoreser, req.params.assetId, req.params.owner);

    // });

    server.get('/transferAsset', function (req, res) {
        if (count % 5 != 0){
            sendTransaction(res, contract1, 'transfer', orgUserId1, clientID2);
        } else {
            sendTransaction(res, contract2, 'transfer', orgUserId2, clientID1);
        }
        count += 1;
    });

    server.get('/status', function (req, res) {
        return {"success": success, "fail": fail};
    });

    server.get('/down', function (req, res) {
        const err = disconnect(gateway1);
        if (err != null) {
            return {"status": err };
        }
        return {"status": "OK"};
    });

    server.listen(3001 + Number(GRPC), "127.0.0.1");
    console.log('Server is running on 127.0.0.1:300', Number(GRPC) + 1,'...')
}

main();