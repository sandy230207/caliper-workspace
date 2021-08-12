'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

class MyWorkload extends WorkloadModuleBase {
    constructor() {
        super();
    }
    
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);

        for (let i=0; i<this.roundArguments.assets; i++) {
            const assetID = `${this.workerIndex}_${i}`;
            console.log(`Worker ${this.workerIndex}: Creating asset ${assetID}`);
            const request = {
                contractId: this.roundArguments.contractId,
                contractFunction: 'CreateAsset',
                invokerIdentity: 'Admin@org1.example.com',
                contractArguments: [assetID,'blue','20','penguin','500'],
                readOnly: false,
                targetPeers: ['peer0.org1.exmple.com']
            };

            await this.sutAdapter.sendRequests(request);
        }
    }
    
    async submitTransaction() {
        const randomId = Math.floor(Math.random()*this.roundArguments.assets);
        const randomOwner = Math.random().toString();
        const randomWorker = Math.floor(Math.random()*this.totalWorkers);
        const myArgs = {
            contractId: this.roundArguments.contractId,
            contractFunction: 'TransferAsset',
            invokerIdentity: 'Admin@org1.example.com',
            contractArguments: [`${randomWorker}_${randomId}`,'owner', randomOwner],
            readOnly: false,
            targetPeers: ['peer0.org1.exmple.com'],
        };

        await this.sutAdapter.sendRequests(myArgs);
        console.log(`${randomWorker}_${randomId} transfer to ${randomOwner}`);
    }
    
    async cleanupWorkloadModule() {
        for (let i=0; i<this.roundArguments.assets; i++) {
            const assetID = `${this.workerIndex}_${i}`;
            console.log(`Worker ${this.workerIndex}: Deleting asset ${assetID}`);
            const request = {
                contractId: this.roundArguments.contractId,
                contractFunction: 'DeleteAsset',
                invokerIdentity: 'Admin@org1.example.com',
                contractArguments: [assetID],
                readOnly: false,
                targetPeers: ['peer0.org1.exmple.com']
            };

            await this.sutAdapter.sendRequests(request);
        }
    }
}

function createWorkloadModule() {
    return new MyWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;