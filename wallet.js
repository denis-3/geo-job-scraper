const ethers = require("ethers")
require("dotenv").config()

const provider = new ethers.JsonRpcProvider("https://rpc-geo-test-zc16z3tcvf.t.conduit.xyz")
const globalWallet = new ethers.Wallet(process.env.WEB3_PRIVATE_KEY, provider)

function getWallet() {
	return globalWallet
}

module.exports = {
	getWallet
}
