// @flow

import crypto from 'crypto';

type Transaction = {
  sender:    string,
  recipient: string,
  amount:    number
};

type Block = {
  index:        number,
  timestamp:    number,
  transactions: Transaction[],
  proof:        number,
  previousHash: string,
};

const GENESIS_PREVIOUS_HASH = 1;
const GENESIS_PROOF = 100;

const SECRET = 'my_blockchain';

function hash(str: string) : string {
  return crypto.createHmac('sha256', SECRET)
               .update(str)
               .digest('hex');
}

function hashOfBlock(block: Block) : string {
  const blockString = JSON.stringify(block, Object.keys(block).sort());
  return hash(blockString);
}

function isValidProof(lastProof, proof) {
  const guess = `${lastProof}${proof}`;
  const guessHash = hash(guess);
  return guessHash.startsWith('0000');
}

function proofOfWork(lastProof) {
  let proof = 0;
  while (!isValidProof(lastProof, proof)) {
    proof += 1;
  }
  return proof;
}

export class Blockchain {
  chain:               Block[];
  currentTransactions: Transaction[];

  constructor() {
    this.chain = [];
    this.currentTransactions = [];

    this.newBlock(GENESIS_PROOF, GENESIS_PREVIOUS_HASH)
  }

  newBlock(proof: number, previousHash: number) {
    const block = {
      index:        this.chain.length + 1,
      timestamp:    Date.now(),
      transactions: this.currentTransactions,
      proof,
      previousHash: previousHash || hashOfBlock(this.lastBlock),
    };
    this.currentTransactions = [];
    this.chain.push(block);
    return block;
  }

  newTransaction(sender: string, recipient: string, amount: number) {
    this.currentTransactions.push({
      sender,
      recipient,
      amount,
    });
    return this.lastBlock.index + 1;
  }

  get lastBlock(): Block {
    return this.chain[this.chain.length - 1];
  }
}
