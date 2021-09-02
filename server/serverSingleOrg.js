/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

require('dotenv').config();
const GRPC = process.env.GRPC;
const NumberOfUsers = 100;
let success = 0;
let fail1 = 0; // number of get ClientID error
let fail2 = 0; // number of MVCC_READ_CONFLICT or other reasons
let fail3 = 0; // number of mint error

let count = 0; // count = success + fail1 + fail2

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('../test-application/javascript/CAUtil.js');
const { buildCCPOrg1, buildWallet } = require('../test-application/javascript/AppUtil.js');
const { get } = require('http');

const caHost = `ca.org1.example.com`;
const department = `org1.department1`;
const mspOrg = `Org1MSP`;
const channelName = 'mychannel';
const chaincodeName = 'token_erc20';
const walletPath = path.join(__dirname, 'wallet');
const orgUserId = `appUser${GRPC}`;

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
async function enrollUsers(NumberOfUsers) {
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

        let users = [];
        for (let i = 0; i < NumberOfUsers; i++) {
            let user = `${orgUserId}-${Math.random()}`;
            // in a real application this would be done only when a new user was required to be added
		    // and would be part of an administrative flow
            await registerAndEnrollUser(caClient, wallet, mspOrg, user, department);
            users.push(user);
        }

        return ccp, wallet, users

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
        return contract;

    } catch (error) {
        console.error(`******** FAILED to connect fabric network: ${error}`);
        return error;
    }
}

async function getClientID(contract) {
    try {
        const clientID = await contract.evaluateTransaction('ClientAccountID');
        return clientID;
    } catch (error) {
        console.error(`******** FAILED to get client ID: ${error}`);
        return error;
    }
}

async function mint(contract, amount) {
    try {
        const result = contract.submitTransaction('Mint', amount);
        return result;
    } catch (error) {
        console.error(`******** FAILED to mint1: ${error}`);
        return error;
    }
}

async function getBalance(contract) {
    try {
        const balance = await contract.evaluateTransaction('ClientAccountBalance');
        return balance;
    } catch (error) {
        console.error(`******** FAILED to get balance of user: ${error}`);
        return error;
    }
}

async function query(res, contract) {
    try {
        console.log(`\n--> [${GRPC}] Evaluate Transaction: Get balance of user`);
        const balance = await getBalance(contract);
        const balanceString = prettyJSONString(balance);
        console.log(`Balance of users: ${balanceString}}\n`);
        res.code(200)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ accountBalance: balanceString });
    } catch (error) {
        console.error(`******** FAILED: ${error}`);
        res.code(501)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ error: error });
    }

}

async function transfer(res, fromContract, toContract) {
    let toID ;
    try {
        toID = await getClientID(toContract);
    } catch (error) {
        fail1 += 1;
    }
    try { 
        console.log(`\n--> [${GRPC}] Submit Transaction: Transfer`);
        await fromContract.submitTransaction('Transfer', toID, "500");
        res.code(200)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ result: "committed" });
        success += 1;

    } catch (error) {
        console.error(`******** FAILED to run the application: ${error}`);
        res.code(503)
            .header('Content-Type', 'application/json; charset=utf-8')
            .send({ result: error })
        fail2 += 1;
        return error;
    }
}

async function disconnect(gateway){
    try {
        gateway.disconnect();
        return null;
    } catch (error) {
        console.error(`******** FAILED to disconnect fabric network: ${error}`);
        return error;
    }
}

async function main(){
    let users = [];
    ccp, wallet, users = await enrollUsers(NumberOfUsers);

    // Generate users
    let contracts = new Map();
    for (let i = 0; i < users.length; i++){
        const contract = await getCC(ccp, wallet, users[i]);
        try {
            await mint(contract, '5000');
            contracts.set(i, contract);
            const balance = await getBalance(contract);
            console.log(`Balance of ${users[i]}: ${prettyJSONString(balance)}\n`);
        } catch (error) {
            fail3 += 1;
            console.error(`******** FAILED to mint2: ${error}`);
        }
    }

    const server = require('fastify')();

    server.get('/getAsset/:user', function (req, res) {
        const user = Number(req.params.user);
        if ( user < users.length && user >= 0) {
            const contract = contracts.get(user);
            query(res, contract);
        } else {
            res.code(200)
                .header('Content-Type', 'application/json; charset=utf-8')
                .send({ balance: "" });
        }
    });

    server.get('/transferAsset', function (req, res) {
        count += 1;
        const from = contracts.get(Math.floor(Math.random() * users.length));
        const to = contracts.get(Math.floor(Math.random() * users.length));
        transfer(res, from, to);
    });

    server.get('/status', function (req, res) {
        return {"success": success, "Get_ClientID_Error": fail1, "MVCC_READ_CONFLICT": fail2, "Mint_error": fail3, "count": count};
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