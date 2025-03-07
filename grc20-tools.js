// tools for managing types and entities related to job scraping

const grc20 = require("@graphprotocol/grc-20")
const { getWallet } = require("./wallet.js")

// console.log(grc20)

async function createSpace(spaceName, initialEditor) {
	const spaceId = await grc20.Graph.createSpace({
		initialEditorAddress: grc20.getChecksumAddress(initialEditor),
		spaceName: spaceName,
		network: "TESTNET"
	})

	return spaceId
}

async function publishOpsToSpace(spaceId, ops, commitMessage) {
	const wa = getWallet()

	// upload changes to IPFS
	const ipfsCid = await grc20.Ipfs.publishEdit({
		name: commitMessage,
		author: wa.address,
		ops: ops
	})

	// get TX info
	const resp = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
		method: "POST",
		body: JSON.stringify({
			cid: ipfsCid,
			network: "TESTNET",
		})
	})

	// publish with on-chain TX
	const { to, data } = await resp.json()

	const publishTx = await wa.sendTransaction({
		to: to,
		value: 0,
		data: data
	})

	return publishTx
}

// creates glassdoor job and glassdoor company type
async function createGDTypes(spaceId) {
	const allOps = []

	const { id: minSalaryId, ops: minSalaryOps } = grc20.Graph.createProperty({
		name: "Minimum salary",
		description: "The minimum salary, per pay period, that can be reasonably expected from a job position.",
		type: "NUMBER"
	})

	const { id: maxSalaryId, ops: maxSalaryOps } = grc20.Graph.createProperty({
		name: "Maximum salary",
		description: "The maximum salary, per pay period, that can be reasonably expected from a job position.",
		type: "NUMBER"
	})

	const { id: payPeriodId, ops: payPeriodOps } = grc20.Graph.createProperty({
		name: "Pay period",
		description: "The frequency of payments to the employee for holding a job.",
		type: "TEXT"
	})

	const { id: reqSkillsId, ops: reqSkillsOps } = grc20.Graph.createProperty({
		name: "Requires",
		description: "That which the entity requires.",
		type: "RELATION"
	})

	const { id: employerId, ops: employerOps } = grc20.Graph.createProperty({
		name: "Employer",
		description: "An entity that employs.",
		type: "RELATION"
	})

	const { id: jobTypeId, ops: jobTypeOps} = grc20.Graph.createType({
		name: "Job opening (Glassdoor)",
		description: "A job opening seeking a qualified candidate (scraped from GlassDoor).",
		properties: [grc20.SystemIds.NAME_ATTRIBUTE,
			grc20.SystemIds.DESCRIPTION_ATTRIBUTE,
			employerId,
			minSalaryId,
			maxSalaryId,
			payPeriodId,
			reqSkillsId,
			grc20.ContentIds.WEB_URL_ATTRIBUTE,
			grc20.ContentIds.PUBLISH_DATE_ATTRIBUTE,
			grc20.ContentIds.CITIES_ATTRIBUTE]
	})

	const { id: compRateId, ops: compRateOps} = grc20.Graph.createProperty({
		name: "Company rating (GlassDoor)",
		description: "The company rating, out of five stars, on GlassDoor.",
		type: "NUMBER"
	})

	const { id: foundedId, ops: foundedOps } = grc20.Graph.createProperty({
		name: "Year estblished",
		description: "The year that the entity was established.",
		type: "NUMBER"
	})

	const { id: compTypeId, ops: compTypeOps} = grc20.Graph.createType({
		name: "Company (Glassdoor)",
		description: "A company profile (scraped from GlassDoor).",
		properties: [grc20.SystemIds.NAME_ATTRIBUTE,
			grc20.SystemIds.DESCRIPTION_ATTRIBUTE,
			grc20.ContentIds.AVATAR_ATTRIBUTE,
			grc20.SystemIds.COVER_ATTRIBUTE,
			compRateId,
			grc20.ContentIds.WEB_URL_ATTRIBUTE,
			foundedId]
	})

	const { id: skillTypeId, ops: skillTypeOps } = grc20.Graph.createType({
		name: "Skill",
		description: "A skill that one can have.",
		properties: [grc20.SystemIds.NAME_ATTRIBUTE,
			grc20.SystemIds.DESCRIPTION_ATTRIBUTE]
	})

	const { id: sanFranId, ops: sanFranOps } = grc20.Graph.createEntity({
		name: "San Francisco",
		description: "A costal city in California.",
		types: [grc20.ContentIds.CITY_TYPE]
	})

	allOps.push(...minSalaryOps, ...maxSalaryOps, ...payPeriodOps, ...employerOps,
		...reqSkillsOps, ...jobTypeOps, ...compRateOps, ...compTypeOps, ...skillTypeOps,
		...sanFranOps, ...foundedId)

	console.log("Newly created entities (copy-paste into main.js):", {
		company: compTypeId,
		jobOpening: jobTypeId,
		skill: skillTypeId,
		compRating: compRateId,
		employer: employerId,
		maxSalary: maxSalaryId,
		minSalary: minSalaryId,
		payPeriod: payPeriodId,
		requires: reqSkillsId,
		yearEst: foundedId,
		cities: {
			"San Francisco": sanFranId
		}
	})

	const txInfo = await publishOpsToSpace(spaceId, allOps, "Add Job opening, Company, and Requirement types (GlassDoor)")
	return txInfo
}

// createSpace("Hackathon glassdoor jobs", "0xC3cAC1469abE025d5De1d944257CD0Ad71D93398").then(console.log)
// createGDTypes("CVQRHcnE9S2XN8GqHeqkZV").then(console.log)



module.exports = { publishOpsToSpace }
