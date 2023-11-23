# Schnitzel Testing Flows 

Schnitzel deployed at: 0xC49E166a7201aF99037cB8acff48281364642038  
Test MATIC (T4) deployed at: 0x499d11E0b6eAC7c0593d8Fb292DCBbF815Fb29Ae  

### Allocations Test Pre Sharepx increase 

- U1, U2, U3, U4, and U5 use the T4 approve function to approve the staker contract  
- U1 deposits into the staker
- U1 allocates non-strictly to U2, U3 and U4  
- U1 allocates strictly to U4 and U5 
- Check that the recipient array for U1 contains U2, U3, U4 and U5
- Check that U2/U3/U4/U5 distributor array contains U1 
- Use allocations view function i.e. U1-U2-false, U1-U4-true and check that all amounts are correct
- Check that the totalAllocated mapping has the correct values 

### Allocation Test Post SharePx increase

- Copy steps for test above 
- Wait for share price to increase
- U1 allocates non-strictly to U2
- Calculate if new allocation share price reflects the individual allocations
- Calculate if new totalAllocations share price reflects the individual allocations 

### Deallocations Test Pre SharePx increase

- U1 deposits and then allocates to U2 and U3 strictly and/or non-strictly
- U1 partially deallocates from U2
- Check that the allocations and totalAllocated mappings are updated correspondingly
- U1 fully deallocates from U2
- Ensure that nothing has been distributed to U2
- Ensure that U2 has been removed from U1's recipients array
- Ensure that U1 has been removed from U2's distributors array
- Ensure the allocations mapping returns zero for all values and that the totalAllocated mapping has been updated with the correct amount but kept the same sharepx

### Deallocations Test Pre SharePx increase

- U1 deposits and then allocates to U2 strictly, and to U3 non-strictly
- Wait for share price to increase
- U1 partially deallocates from U2
- Ensure U2 has been distributed rewards 
- Ensure the new allocation share price is the current share price
- Ensure the totalAllocations mapping has been updated with the correct amount and sharepx 
- U1 partially deallocates from U3
- Ensure nothing has been distributed to U3
- Ensure the allocation share price remains the same but the amount is updated
- Ensure the totalAllocations sharePx and amount are updated correctly

### Distributing rewards single

- U1 deposits and then allocates strictly to U3 and non-strictly to U4 
- Wait for sharepx to increase 
- Call distributeRewards for U3
- Ensure allocations and totalAllocations mapping are updated correctly (sharepx should change, amount should stay the same)
- Check if amount of tMatic U1 loses corresponds to amount gained by U3
- Check if correct amount was given to U3 
- Call distributeRewards for U4 
- Ensure allocations and totalAllocations mapping are updated correctly (sharepx should change, amount should stay the same)
- Ensure amount burned from U1 is amount gained by treasury and U4
- Calculate that the above amount is correct 

### Distributing rewards for all
- U1 deposits and then allocates strictly to U2 and U3 and non-strictly to U4 and U5
- Wait for sharepx to increase
- Call distributeAll non-strictly 
- Ensure allocations and totalAllocations mapping are updated correctly (sharepx should change, amount should stay the same)
- Ensure correct amount is allocated to each person plus treasury and burned from U1
- Call distributeAll strictly 
- Ensure allocations and totalAllocations mapping are updated correctly (sharepx should change, amount should stay the same)
- Ensure U4 and U5 got the amount burned from U1 and that this amount is correct 


