import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployment } from "../helpers/fixture";
import { calculateTrsyWithdrawFees, calculateSharesFromAmount, parseEther } from "../helpers/math";
import { submitCheckpoint } from "../helpers/state-interaction";

describe("TruMATIC ERC20 Functionality", () => {
    let one, two, three, staker, treasury, phiPrecision,deployer;
    let name = "TruStake MATIC Vault Shares";
    let symbol = "TruMATIC";
    let TREASURY_INITIAL_DEPOSIT
    beforeEach(async () => {
      // reset to fixture
      ({ treasury, one, two, three, staker, deployer } = await loadFixture(deployment));
      TREASURY_INITIAL_DEPOSIT = parseEther(100); 
      await staker.connect(treasury).deposit(TREASURY_INITIAL_DEPOSIT, treasury.address);
    });
        it('has a name', async function () {
            expect(await staker.name()).to.equal(name);
        });
        
        it('has a symbol', async function () {
        expect(await staker.symbol()).to.equal(symbol);
        });

    describe("totalSupply",() => {
        let totalStaked, totalSupply;
        beforeEach(async () => {
            await staker.connect(three).deposit(parseEther(1000), three.address);
            await staker.connect(one).deposit(parseEther(1000),one.address);
            await staker.connect(two).deposit(parseEther(1000),two.address);
            totalStaked = await staker.totalStaked();
            totalSupply = await staker.totalSupply();
        });

            it("totalSupply equals totalStaked for first deposits", async function(){
            // after first deposits without rewards accrued, totalSupply should equal totalStaked
            expect(totalStaked).to.equal(totalSupply);
            });

            it("totalSupply is not altered by rewards accrual without deposit", async function() {
            // accrue rewards 
            await submitCheckpoint(0);
     
            // totalSupply should not have increased as no new shares are minted
            expect(await staker.totalSupply()).to.equal(totalSupply);
            });

            it("new deposit after reward accrual increases totalSupply",async function(){
            // accrue rewards
            await submitCheckpoint(0);

            // get rewards and new shareprice
            let totalRewards = await staker.totalRewards();
            const [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

            // deposit again to mint shares to treasury
            await staker.connect(one).deposit(parseEther(1000),one.address)
            const newAmtStakedInTruMATIC = calculateSharesFromAmount(parseEther(1000),[globalSharePriceNumerator, globalSharePriceDenominator]);
            const trsyShares = calculateTrsyWithdrawFees(totalRewards,[globalSharePriceNumerator, globalSharePriceDenominator]);

            // now, totalSupply should equal the previous amount staked plus the amount minted from new deposit plus fee shares minted to the treasury
            expect(await staker.totalSupply()).to.equal(totalSupply.add(newAmtStakedInTruMATIC).add(trsyShares));
            });

            it("withdraw requests pre accrual decrease totalSupply correctly", async function(){
                const withdrawAmount = parseEther(1000);

                // withdraw
                await staker.connect(one).withdraw(withdrawAmount,one.address,one.address);
                await staker.connect(two).withdraw(withdrawAmount,two.address,two.address);
                expect(await staker.totalSupply()).to.equal(withdrawAmount.add(TREASURY_INITIAL_DEPOSIT));
                expect(await staker.balanceOf(one.address)).to.equal(0);
                expect(await staker.balanceOf(two.address)).to.equal(0);
            })
            
            it("withdraw requests post accrual decrease totalSupply correctly", async function(){
                const withdrawAmount = parseEther(1000);
                // ACCRUE
                await submitCheckpoint(0);

                // Get rewards & new share price
                let totalRewards = await staker.totalRewards();
                const [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();

                // Withdraw user 1
                await staker.connect(one).withdraw(withdrawAmount,one.address,one.address);

                // Treasury Shares
                const trsyShares = calculateTrsyWithdrawFees(totalRewards,[globalSharePriceNumerator,globalSharePriceDenominator])
            
                await staker.connect(two).withdraw(withdrawAmount,two.address,two.address);
                // expect the new totalSupply to be treasury deposit amount + user3 amount left + shares minted to treasury
                expect(await staker.totalSupply()).to.equal(TREASURY_INITIAL_DEPOSIT.add(withdrawAmount).add(trsyShares));
            })
    });

    describe("balanceOf",() => {
        it("correctly updates balances post deposit",async function() {
            expect(await staker.balanceOf(one.address)).to.equal(0);
            await staker.connect(one).deposit(parseEther(2000),one.address);
            expect(await staker.balanceOf(one.address)).to.equal(parseEther(2000));
        });

        it("correctly updates sharePrice post reward accrual",async function() {
            await staker.connect(one).deposit(parseEther(2000),one.address);
            let [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();
            expect(globalSharePriceNumerator.div(globalSharePriceDenominator)).to.equal(parseEther(1));
            
            // accrue rewards
            await submitCheckpoint(0);
            [globalSharePriceNumerator, globalSharePriceDenominator] = await staker.sharePrice();
            expect(globalSharePriceNumerator.div(globalSharePriceDenominator)).to.be.gt(parseEther(1))
        });
    });

    describe("transfer", () => {
      it("correctly transfers post deposit", async function () {
        // deposit
        await staker.connect(one).deposit(parseEther(2000), one.address);

        // check TruMATIC balances
        expect(await staker.balanceOf(two.address)).to.equal(0);
        expect(await staker.balanceOf(one.address)).to.equal(parseEther(2000));

        // attempt to transfer TruMATIC
        await staker.connect(one).transfer(two.address, parseEther(1000));

        // check TruMATIC was transferred 
        expect(await staker.balanceOf(two.address)).to.equal(parseEther(1000));
        expect(await staker.balanceOf(one.address)).to.equal(parseEther(1000));
      });

        it("Reverts with custom error if more than users balance is transferred",async function() {
            // override beforetokentransfer function 
            await expect(staker.connect(one).transfer(two.address,parseEther(2000))).to.be.revertedWithCustomError(staker,"ExceedsUnallocatedBalance");
        });

      it("Transfer post loose allocation works", async function () {
        // deposit
        await staker.connect(one).deposit(parseEther(2000), one.address);
        expect(await staker.balanceOf(two.address)).to.equal(parseEther(0));
        expect(await staker.balanceOf(one.address)).to.equal(parseEther(2000));
        
        // loose allocation
        await staker.connect(one).allocate(parseEther(2000), two.address, false);

        // transfer
        await staker.connect(one).transfer(two.address, parseEther(1000));
        expect(await staker.balanceOf(two.address)).to.equal(parseEther(1000));
        expect(await staker.balanceOf(one.address)).to.equal(parseEther(1000));
      });
    });

    describe("transferFrom", () => {
      const allowance = parseEther(2000);

      it("Reverts without allowance/with insufficient balance", async function () {
        await expect(staker.connect(two).transferFrom(one.address, two.address, allowance)).to.be.revertedWith(
          "ERC20: insufficient allowance"
        );
        await staker.connect(one).approve(two.address, allowance);

        // user has no TruMATIC so this should also revert
        await expect(
          staker.connect(two).transferFrom(one.address, two.address, allowance)
        ).to.be.revertedWithCustomError(staker, "ExceedsUnallocatedBalance");
      });

      it("transferFrom after deposit works", async function () {
        // deposit
        await staker.connect(one).deposit(allowance.mul(2), one.address);

        // approve
        await staker.connect(one).approve(two.address, allowance);

        // transferFrom works and balances/allowance are updated
        await staker.connect(two).transferFrom(one.address, two.address, allowance);
        expect(await staker.allowance(one.address, two.address)).to.equal(0);
        expect(await staker.balanceOf(one.address)).to.equal(allowance);
        expect(await staker.balanceOf(two.address)).to.equal(allowance);
      });

      it("transferFrom after loose allocation works", async function () {
        // deposit 
        await staker.connect(one).deposit(allowance.mul(2), one.address);

        // loose allocation
        await staker.connect(one).allocate(parseEther(2000), two.address, false);

        // approve and transfer TruMATIC
        await staker.connect(one).approve(two.address, allowance);
        await staker.connect(two).transferFrom(one.address, two.address, allowance);

        // check new Balances/allowance 
        expect(await staker.allowance(one.address, two.address)).to.equal(0);
        expect(await staker.balanceOf(one.address)).to.equal(allowance);
        expect(await staker.balanceOf(two.address)).to.equal(allowance);
      });
    });

  describe("Strict Allocation", () => {
    describe("totalSupply", () => {
      let totalSupply;
      beforeEach(async () => {
        await staker.connect(one).deposit(parseEther(2000), one.address);
        await staker.connect(two).deposit(parseEther(1000), two.address);
        totalSupply = await staker.totalSupply();
      });

      it("distributing rewards does not affect totalSupply", async function () {
        await staker.connect(deployer).setAllowStrict(true);

        // allocate loose and strict
        await staker.connect(one).allocate(parseEther(2000), two.address, true);
        await staker.connect(two).allocate(parseEther(1000), one.address, false);

        // accrue rewards
        await submitCheckpoint(0);

        // distribute rewards
        await staker.connect(one).distributeRewards(two.address, one.address, true);
        await staker.connect(two).distributeRewards(one.address, two.address, false);

        // totalSupply should remain unchanged
        expect(await staker.totalSupply()).to.equal(totalSupply);
      });
    });

    describe("transfer", () => {
      it("Transfer post strict allocation fails", async function () {
        await staker.connect(deployer).setAllowStrict(true);

        // deposit
        await staker.connect(one).deposit(parseEther(2000), one.address);

        // allocation 
        await staker.connect(one).allocate(parseEther(2000), two.address, true);

        await expect(staker.connect(one).transfer(two.address, parseEther(1000))).to.be.revertedWithCustomError(
          staker,
          "ExceedsUnallocatedBalance"
        );
        expect(await staker.balanceOf(two.address)).to.equal(parseEther(0));
        expect(await staker.balanceOf(one.address)).to.equal(parseEther(2000));
      });
    });

    describe("transferFrom", () => {
      const allowance = parseEther(2000);
      it("transferFrom after strict allocation reverts if more than unallocated balance is transferred", async function () {
        await staker.connect(deployer).setAllowStrict(true);

        // deposit
        await staker.connect(one).deposit(allowance.mul(2), one.address);

        // allocate and approve
        await staker.connect(one).allocate(parseEther(2000), two.address, true);
        await staker.connect(one).approve(two.address, allowance.mul(2));

        await expect(
          staker.connect(two).transferFrom(one.address, two.address, allowance.mul(2))
        ).to.be.revertedWithCustomError(staker, "ExceedsUnallocatedBalance");
      });
    });
  });
});
