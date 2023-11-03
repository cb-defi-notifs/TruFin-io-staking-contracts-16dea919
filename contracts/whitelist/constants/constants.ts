import { constants } from "ethers";

// --- Chain Config ---

export enum CHAINID {
    ETH_MAINNET = 1,
    MATIC = 137,
    MUMBAI = 80001,
    GOERLI = 5,
}

// --- Constructor Arguments ---

export const QUADRATA_PASSPORT = {
    [CHAINID.ETH_MAINNET]: "0x2e779749c40CC4Ba1cAB4c57eF84d90755CC017d",
    [CHAINID.MATIC]: "0x2e779749c40CC4Ba1cAB4c57eF84d90755CC017d",
    [CHAINID.MUMBAI]: "0xF4d4F629eDD73680767eb7b509C7C2D1fE551522",
    [CHAINID.GOERLI]: "0xF4d4F629eDD73680767eb7b509C7C2D1fE551522",
};

export const QUADRATA_READER = {
    [CHAINID.ETH_MAINNET]: "0xFEB98861425C6d2819c0d0Ee70E45AbcF71b43Da",
    [CHAINID.MATIC]: "0xFEB98861425C6d2819c0d0Ee70E45AbcF71b43Da",
    [CHAINID.MUMBAI]: "0x5C6b81212c0A654B6e247F8DEfeC9a95c63EF954",
    [CHAINID.GOERLI]: "0x5C6b81212c0A654B6e247F8DEfeC9a95c63EF954",
};

export const VERITE_REGISTRY = {
    [CHAINID.ETH_MAINNET]: constants.AddressZero,
    [CHAINID.MATIC]: constants.AddressZero,
    [CHAINID.MUMBAI]: constants.AddressZero,
    [CHAINID.GOERLI]: constants.AddressZero,
};

export const BLACKLISTED_COUNTRIES = [
    "AF", // Afghanistan
    "AL", // Albania
    "AS", // American Samoa
    "AO", // Angola
    "AM", // Armenia
    "AZ", // Azerbaijan
    "BB", // Barbados
    "BY", // Belarus
    "BA", // Bosnia and Herzegovina
    "BW", // Botswana
    "BI", // Burundi
    "KH", // Cambodia
    "CM", // Cameroon
    "CF", // Central African Republic (the)
    "TD", // Chad
    "CN", // China
    "CG", // Congo (the) [g]
    "CD", // Congo (the Democratic Republic of the)
    "CI", // Côte d'Ivoire [h]
    "CU", // Cuba
    "ER", // Eritrea
    "ET", // Ethiopia
    "GH", // Ghana
    "GU", // Guam
    "GN", // Guinea
    "GW", // Guinea-Bissau
    "HT", // Haiti
    "IR", // Iran (Islamic Republic of)
    "IQ", // Iraq
    "LA", // Lao People's Democratic Republic (the) [q]
    "LB", // Lebanon
    "LR", // Liberia
    "LY", // Libya
    "MG", // Madagascar
    "ML", // Mali
    "MD", // Moldova (the Republic of)
    "ME", // Montenegro
    "MZ", // Mozambique
    "MM", // Myanmar [t]
    "NI", // Nicaragua
    "KP", // Korea (the Democratic People's Republic of) [o]
    "MP", // Northern Mariana Islands (the)
    "PK", // Pakistan
    "PR", // Puerto Rico
    "RU", // Russian Federation (the) [v]
    "RS", // Serbia
    "SO", // Somalia
    "SS", // South Sudan
    "LK", // Sri Lanka
    "SD", // Sudan (the)
    "SY", // Syrian Arab Republic (the) [x]
    "TJ", // Tajikistan
    "TT", // Trinidad and Tobago
    "TM", // Turkmenistan
    "UG", // Uganda
    "US", // United States of America (the)
    "UZ", // Uzbekistan
    "VU", // Vanuatu
    "VE", // Venezuela (Bolivarian Republic of)
    "VG", // Virgin Islands (British) [af]
    "YE", // Yemen
    "ZW", // Zimbabwe
];
