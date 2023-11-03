// SPDX-License-Identifier: MIT
pragma solidity =0.8.19;

import {IQuadReader} from "../interfaces/IQuadReader.sol";

contract mockKYCReader {
    address noRisk;
    address noAMLRisk;
    address noCountryRisk;
    mapping(address => bool) passports;

    function mockAddPassport(address _account) external {
        passports[_account] = true;
    }

    function setNoRiskAddress(address _addr) external {
        noRisk = _addr;
    }

    function setNoAMLRiskAddress(address _addr) external {
        noAMLRisk = _addr;
    }

    function setNoCountryRiskAddress(address _addr) external {
        noCountryRisk = _addr;
    }

    function queryFee(address _account, bytes32 _attribute)
        public
        view
        returns (uint256)
    {
        return 20000000000000000;
    }

    function getAttributes(address _account, bytes32 _attribute)
        external
        payable
        returns (IQuadReader.Attribute[] memory attributes)
    {
        require(_account != address(0), "ACCOUNT_ADDRESS_ZERO");
        attributes = new IQuadReader.Attribute[](1);
        if (
            _attribute ==
            0xaf192d67680c4285e52cd2a94216ce249fb4e0227d267dcc01ea88f1b020a119
        ) {
            //AML
            if (_account == noRisk || _account == noAMLRisk) {
                attributes[0] = IQuadReader.Attribute(
                    0x0000000000000000000000000000000000000000000000000000000000000001,
                    1664277255,
                    0x000EB9647BB384FeDe32c0933FB1bF41744a7862
                );
            } else {
                attributes[0] = IQuadReader.Attribute(
                    0x0000000000000000000000000000000000000000000000000000000000000009,
                    1664277255,
                    0x000EB9647BB384FeDe32c0933FB1bF41744a7862
                );
            }
        } else {
            //Country
            if (_account == noRisk || _account == noCountryRisk) {
                attributes[0] = IQuadReader.Attribute(
                    0xa58de32261c1daca7d9359f64242e87c5d42b10589f30dafe0c3cf007786f64a,
                    1664277255,
                    0x000EB9647BB384FeDe32c0933FB1bF41744a7862
                );
            } else {
                attributes[0] = IQuadReader.Attribute(
                    0x627fe66dd064a0a7d686e05b87b04d5a7c585907afae1f0c65ab27fa379ca189,
                    1664277255,
                    0x000EB9647BB384FeDe32c0933FB1bF41744a7862
                );
            }
        }

        uint256 fee = queryFee(_account, _attribute);
        require(msg.value == fee, "INVALID_QUERY_FEE");
    }

    function balanceOf(address _account, bytes32 _attribute)
        external
        view
        returns(uint256) {
            if (passports[_account] && _attribute ==
            0xaf192d67680c4285e52cd2a94216ce249fb4e0227d267dcc01ea88f1b020a119)
            {
                return 1;
            } else {
                return 0;
            }
        }
}
