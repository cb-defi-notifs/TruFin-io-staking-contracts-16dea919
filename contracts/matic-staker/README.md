# Staker 🥩

### Setup
Install the dependencies by running `npm i`.
For VS Code users, install the `editorconfig.editorconfig` extension.

### Running the tests
To run the tests, run `npx hardhat test`.

### Linting and prettifying
To run Solhint, run `npm run lint-sol`.
To run Prettier for Solidity, run `npm run prettify-sol`.

### Code coverage
To run code coverage on the Solidity files, run `npm run coverage-sol`.
You can find the coverage reports written to the ./coverage/ folder generated in your root directory.

### Checking gas usage
To get a report on gas usage, run `npm run check-gas`.



### Contract deployment:


1. Deploy:  
`npx hardhat run scripts/deploy/deploy-staker.ts --network <goerli or mainnet>`

2. Verify:  
`npx hardhat verify <new staker implementation address> --network <goerli or mainnet>`

Note: If deploying for mainnet, don't forget to change the proxy admin to be controlled by a multisig.


#### Upgrading Testnet (Goerli)

To upgrade for testnet, deploy the implementation and update the proxy in one go.

Run the following commands:

1. Deploy:  
`CONTRACT=<the proxy contract address> npx hardhat run scripts/deploy/upgrade-staker.ts --network goerli`
2. Verify:  
`npx hardhat verify <new staker implementation address> --network goerli`


#### Upgrading Mainnet (Ethereum)

To upgrade for mainnet, deploy the implementation and update the proxy separately as the proxy can only be updated using a multisig.
   
Run the following commands:

1. Deploy the implementation:  
`npx hardhat run scripts/deploy/deploy-implementation.ts --network mainnet`
1. Verify the deployment:  
`npx hardhat verify <new implementation address> --network mainnet`
1. Manually upgrade the proxy admin to point the proxy to the new implementation. This is done via the Safe app.
2. Import the implementation:  
   `IMPLEMENTATION=<new implementation address> npx hardhat run scripts/deploy/import-implementation.ts --network mainnet`
 