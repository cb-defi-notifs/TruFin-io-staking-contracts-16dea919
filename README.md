# smart-contracts
This repo is the central place for TruFin's smart contracts.

### Monorepo
Tasks can be run for all the projects at once from the root folder.

`npm run test`: runs all the tests contained in the repo.  
`npm run lint-sol`: runs SolHint for security and style guide validations.  
`npm run coverage-sol`: runs tests coverage. The coverage reports will be written to a ./coverage/ folder in the packages folders.  
`npm run check-gas`: runs the tests and print tables with gas usage.  
`npm run prettify-sol`: runs the prettifier. This will apply changes to the files, so use with caution.  


To target a package in particular, you can either target the relevant package by doing `lerna run test --scope whitelist` or you can navigate to the package and run the relevant npm task.
