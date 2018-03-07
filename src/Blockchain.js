// @flow
import url        from 'url';
import crypto     from 'crypto';
import uuidv4     from 'uuid/v4';
import express    from 'express';
import bodyParser from 'body-parser';
import 'isomorphic-fetch';

import type { $Response } from 'express';

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

const GENESIS_PREVIOUS_HASH = '1';
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
  nodes:               Set<string>;

  constructor() {
    this.chain               = [];
    this.currentTransactions = [];
    this.nodes               = new Set();

    this.newBlock(GENESIS_PROOF, GENESIS_PREVIOUS_HASH)
  }

  newBlock(proof: number, previousHash: ?string) {
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

  registerNode(address: string) {
    const { host } = url.parse(address);
    if (host) {
      this.nodes.add(host);
    }
  }

  isValidChain(chain: Block[]): bool {
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const lastBlock = chain[i]
      const block     = chain[i + 1];
      if (block.previousHash !== hashOfBlock(lastBlock)) {
        return false;
      }
      if (!isValidProof(lastBlock.proof, block.proof)) {
        return false;
      }
    }
    return true;
  }

  async resolveConflicts() {
    let newChain     = null;
    let maxLength    = this.chain.length;
    for (let node of this.nodes) {
      const response = await fetch(`http://${node}/chain`);
      if (response.status >= 200 && response.status < 300) {
        const { length, chain } = await response.json();
        if (length > maxLength && this.isValidChain(chain)) {
          maxLength = length;
          newChain = chain;
        }
      }
    }
    if (newChain) {
      this.chain = newChain;
      return true;
    }
    return false;
  }

  get lastBlock(): Block {
    return this.chain[this.chain.length - 1];
  }
}

const app = express();
const blockchain = new Blockchain()
const nodeIdentifier = uuidv4().replace('-', '');
const port = process.env.PORT || 5000;

app.use(bodyParser.json());
app.get('/mine', (req, res: $Response) => {
  const { lastBlock } = blockchain;
  const { proof } = lastBlock;
  blockchain.newTransaction('0', nodeIdentifier, 1);
  const block = blockchain.newBlock(proofOfWork(proof), hashOfBlock(lastBlock))
  res.json({
    message:      'New Block Forged',
    index:        block.index,
    transactions: block.transactions,
    proof:        block.proof,
    previousHash: block.previousHash,
  });
});

app.post('/transactions/new', (req, res: $Response) => {
  const { sender, recipient, amount } = req.body;
  const index = blockchain.newTransaction(sender, recipient,  amount);
  res.status(201)
    .json({ message: `Transaction will be added to Block ${index}` });
});

app.get('/chain', (req, res: $Response) => res.json({
  chain:  blockchain.chain,
  length: blockchain.chain.length,
}));

app.post('/nodes/register', (req, res: $Response) => {
  const { nodes } = req.body;
  if (!nodes) {
    res.status(400)
       .json({ message: 'Error: Please supply a valid list of nodes' });
    return;
  }
  nodes.forEach(node => blockchain.registerNode(node));
  res.status(201)
     .json({
       message:    'New nodes have been added',
       totalNodes: blockchain.nodes,
     });
});

app.get('/nodes/resolve', async (req, res: $Response) => {
  const replaced = await blockchain.resolveConflicts();
  if (replaced) {
    res.json({
      message:  'Our chain was replaced',
      newChain: blockchain.chain,
    });
    return;
  }
  res.json({
    message:  'Our chain is authoritative',
    newChain: blockchain.chain,
  });
});

app.listen(port, () => console.log(`app listening on port ${port}!`));
