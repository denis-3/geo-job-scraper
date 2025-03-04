// tools for managing types and entities related to job scraping

const grc20 = require("@graphprotocol/grc-20")
const { getWallet } = require("./wallet.js")

// console.log(grc20)

async function createSpace(spaceName, initialEditor) {
	const result = await fetch("https://api-testnet.grc-20.thegraph.com/deploy", {
		method: "POST",
		body: JSON.stringify({
			initialEditorAddress: grc20.getChecksumAddress(initialEditor),
			spaceName: spaceName,
		})
	})

	const { spaceId } = await result.json();
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

	const { id: minSalaryId, ops: minSalaryOps} = grc20.Graph.createProperty({
		name: "Minimum Salary",
		type: "NUMBER"
	})

	const { id: maxSalaryId, ops: maxSalaryOps} = grc20.Graph.createProperty({
		name: "Maximum Salary",
		type: "NUMBER"
	})

	const { id: payPeriodId, ops: payPeriodOps} = grc20.Graph.createProperty({
		name: "Pay Period",
		type: "NUMBER"
	})

	const { id: reqSkillsId, ops: reqSkillsOps} = grc20.Graph.createProperty({
		name: "Requires Skills",
		type: "RELATION"
	})

	const { id: employerId, ops: employerOps} = grc20.Graph.createProperty({
		name: "Employer",
		type: "RELATION"
	})

	const { id: jobTypeId, ops: jobTypeOps} = grc20.Graph.createType({
		name: "Job Opening (Glassdoor)2",
		properties: [grc20.SystemIds.NAME_ATTRIBUTE,
			grc20.SystemIds.DESCRIPTION_ATTRIBUTE,
			employerId,
			grc20.ContentIds.LOCATION_ATTRIBUTE,
			minSalaryId,
			maxSalaryId,
			payPeriodId,
			reqSkillsId,
			grc20.ContentIds.WEB_URL_ATTRIBUTE,
			grc20.ContentIds.PUBLISH_DATE_ATTRIBUTE]
	})

	const { id: compRateId, ops: compRateOps} = grc20.Graph.createProperty({
		name: "Company Rating (GlassDoor)",
		type: "NUMBER"
	})

	const { id: compTypeId, ops: compTypeOps} = grc20.Graph.createType({
		name: "Company Profile (Glassdoor)2",
		properties: [grc20.SystemIds.NAME_ATTRIBUTE,
			grc20.SystemIds.DESCRIPTION_ATTRIBUTE,
			grc20.ContentIds.AVATAR_ATTRIBUTE,
			grc20.SystemIds.COVER_ATTRIBUTE,
			compRateId,
			grc20.ContentIds.WEB_URL_ATTRIBUTE]
	})

	allOps.push(...minSalaryOps, ...maxSalaryOps, ...payPeriodOps, ...employerOps,
	...reqSkillsOps, ...jobTypeOps, ...compRateOps, ...compTypeOps)

	// add descriptions
	const newPropIds = [minSalaryId, maxSalaryId, payPeriodId, employerId, reqSkillsId, jobTypeId, compTypeId, compRateId]
	const descriptions = [
		"The minimum salary, per pay period, that can be reasonably expected from a job position.",
		"The maximum salary, per pay period, that can be reasonably expected from a job position.",
		"The frequency of payments to the employee for holding a job.",
		"Employer of the entity.",
		"A required skill for the job opening or position.",
		"A job opening seeking a qualified candidate (scraped from the GlassDoor website).",
		"A company profile (scraped from the GlassDoor website).",
		"The company rating out of 5 stars (scraped from the GlassDoor website)."
	]

	newPropIds.forEach((p, i) => {
		allOps.push(
			grc20.Triple.make({
				entityId: p,
				attributeId: grc20.SystemIds.DESCRIPTION_ATTRIBUTE,
				value: { value: descriptions[i], type: "TEXT" }
			})
		)
	})

	const txInfo = await publishOpsToSpace(spaceId, allOps, "Add Job Opening and Company types from GlassDoor")
	return txInfo
}

// createSpace("Hackathon glassdoor jobs", "0xC3cAC1469abE025d5De1d944257CD0Ad71D93398").then(console.log)
// createGDTypes("CVQRHcnE9S2XN8GqHeqkZV")



module.exports = { publishOpsToSpace }
