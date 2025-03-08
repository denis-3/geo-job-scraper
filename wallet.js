const ethers = require("ethers")
const grc20 = require("@graphprotocol/grc-20")
require("dotenv").config()

async function getWallet() {
	var w = null
	if (process.env.MAINNET === "true") {
		w = await grc20.getSmartAccountWalletClient({
			privateKey: process.env.WEB3_PRIVATE_KEY
		})
		w.address = w.account.address
	} else {
		const provider = new ethers.JsonRpcProvider("https://rpc-geo-test-zc16z3tcvf.t.conduit.xyz")
		w = new ethers.Wallet(process.env.WEB3_PRIVATE_KEY, provider)
	}
	return w
}

module.exports = {
	getWallet
}
