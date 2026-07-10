const policyId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const assetName = "ContractToken";
const assetNameHex = Buffer.from(assetName).toString("hex");

export const walletContractFixtures = {
  address:
    "DdzFFzCqrht4wFnWC5TJA5UUVE54JC9xZWq589iKyCrWa6hek3KKevyaXzQt6FsdunbkZGzBFQhwZi1MDpijwRoC7kj1MkEPh2Uu5Ssz",
  unusedAddress:
    "DdzFFzCqrhtBBX4VvncQ6Zxn8UHawaqSB4jf9EELRBuWUT9gZTmCDWCNTVMotEdof1g26qbrDc8qcHZvtntxR4FaBN1iKxQ5ttjZSZoj",
  stakeAddress: "e15e8600926ab1856e52bf2f2960def3bc59f7ffa5c4162a578ddd264b",
  missingStakeAddress:
    "e1b48e1d28ae9d4ea604ec265551d177cd2b5ccb18818c7f1b70cfd42a",
  poolId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  blockHash:
    "1111111111111111111111111111111111111111111111111111111111111111",
  txHash:
    "2222222222222222222222222222222222222222222222222222222222222222",
  inputTxHash:
    "3333333333333333333333333333333333333333333333333333333333333333",
  dataHash:
    "4444444444444444444444444444444444444444444444444444444444444444",
  policyId,
  assetName,
  assetNameHex,
  tokenId: `${policyId}.${assetNameHex}`,
  metadataTokenId: `${policyId}.${assetName}`,
  tokenMetadata: {
    name: assetName,
    image: "https://metadata.test/assets/contract-token.png",
    description: "Local contract-test token metadata",
  },
};
