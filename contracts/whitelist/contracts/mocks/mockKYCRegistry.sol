// SPDX-License-Identifier: MIT
pragma solidity =0.8.19;

contract mockKYCRegistry {
    mapping(address => bool) verified;

    function mockVerify(address _account) external {
        verified[_account] = true;
    }

    function mockUnverify(address _account) external {
        verified[_account] = false;
    }

    function isVerified(address subject) external view returns (bool) {
        return verified[subject];
    }
}
