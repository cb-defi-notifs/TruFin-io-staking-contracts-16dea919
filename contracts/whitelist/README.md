# Whitelist


### Deployment:


1. Deploy:  
`npx hardhat run scripts/deploy/deploy-whitelist.ts --network <goerli, sepolia or mainnet>`

2. Verify:  
`npx hardhat verify <new whitelist implementation address> --network <goerli, sepolia or mainnet>`

Note: If deploying for mainnet, don't forget to change the proxy admin to be controlled by a multisig.


#### Upgrading Testnet (Goerli)

To upgrade for testnet, deploy the implementation and update the proxy in one go.

Run the following commands:

1. Deploy:  
`CONTRACT=<the proxy contract address> npx hardhat run scripts/deploy/upgrade-whitelist.ts --network goerli`
2. Verify:  
`npx hardhat verify <new whitelist implementation address> --network goerli`

#### Upgrading Testnet (Sepolia)

To upgrade for testnet, deploy the implementation and update the proxy in one go.

Run the following commands:

1. Deploy:  
`CONTRACT=<the proxy contract address> npx hardhat run scripts/deploy/upgrade-whitelist.ts --network sepolia`
2. Verify:  
`npx hardhat verify <new whitelist implementation address> --network sepolia`


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
 