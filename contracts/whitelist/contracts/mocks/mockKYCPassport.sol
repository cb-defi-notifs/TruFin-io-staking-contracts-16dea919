// SPDX-License-Identifier: MIT
pragma solidity =0.8.19;

contract mockKYCPassport {
    mapping(address => bool) passports;

    function mockAddPassport(address _account) external {
        passports[_account] = true;
    }

    function mockRemovePassport(address _account) external {
        passports[_account] = false;
    }

    function balanceOf(address account, uint256 id)
        external
        view
        returns (uint256)
    {
        if (passports[account] && id == 1) {
            return 1;
        } else {
            return 0;
        }
    }
}
