// tools for managing types and entities related to job scraping

const grc20 = require("@graphprotocol/grc-20")
const { getWallet } = require("./wallet.js")
require("dotenv").config()
const MAINNET = process.env.MAINNET === "true"

// console.log(grc20)

// gets triples and relations of entity
async function getFullEntity(entityId) {
	// this query is useful for debugging and instrospection
	const introspectionGQL = `query {
		__type(name: "Relation") {
			name
			fields {
				name
				type {
					name
					kind
					ofType {
						name
						kind
					}
				}
			}
		}
	}`

	// actual Geo query to get all triples and relations of an entity
	const entityGQL = `query {
		entities(filter: {id: {equalTo: "${entityId}"}}) {
			nodes {
				name
				triples {
					nodes {
						attributeId
						valueType
						numberValue
						textValue
						booleanValue
						attribute {
							name
						}
					}
					totalCount
				}
				relationsByFromEntityId {
					nodes {
						typeOfId
						toEntityId
						typeOf {
							name
						}
						entity {
							id
						}
					}
					totalCount
				}
			}
		}
	}`

	const gqlEndpoint = MAINNET ? "https://hypergraph.up.railway.app/graphql" : "https://geo-conduit.up.railway.app/graphql"
	const resp = await fetch(gqlEndpoint, {
		method: "POST",
		headers: {
			"Accept": "application/graphql-response+json",
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			query: entityGQL
		})
	})

	const json = await resp.json()
	const entity = json.data.entities.nodes[0]
	if (entity === undefined) return undefined
	const returnData = {
		name: entity.name,
		id: entityId,
		triples: [],
		relations: []
	}

	entity.triples.nodes.forEach(t => {
		returnData.triples.push({
			id: t.attributeId,
			valueType: t.valueType,
			value: t.textValue ?? t.numberValue ?? t.booleanValue,
			attributeName: t.attribute.name
		})
	})

	entity.relationsByFromEntityId.nodes.forEach(r => {
		returnData.relations.push({
			id: r.entity.id,
			typeId: r.typeOfId,
			toEntityId: r.toEntityId,
			relationName: r.typeOf.name
		})
	})

	return returnData
}

async function createSpace(spaceName, initialEditor) {
	const spaceId = await grc20.Graph.createSpace({
		initialEditorAddress: grc20.getChecksumAddress(initialEditor),
		spaceName: spaceName,
		network: "TESTNET"
	})

	return spaceId
}

async function publishOpsToSpace(spaceId, ops, commitMessage) {
	const wa = await getWallet()

	// upload changes to IPFS
	const ipfsCid = await grc20.Ipfs.publishEdit({
		name: commitMessage,
		author: wa.address,
		ops: ops
	})

	// get TX info
	var resp = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${spaceId}/edit/calldata`, {
		method: "POST",
		body: JSON.stringify({
			cid: ipfsCid,
			network: MAINNET ? "MAINNET" : "TESTNET",
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

// call getEntityTriples() above, then pass the result into here to get ops
function deleteEntity(entityObj) {
	const delOps = []

	entityObj.triples.forEach(t => {
		delOps.push(grc20.Triple.remove({
			entityId: entityObj.id,
			attributeId: t.id
		}))
	})

	entityObj.relations.forEach(r => {
		delOps.push(grc20.Relation.remove(r.id))
	})

	return delOps
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
		name: "Date estblished",
		description: "The date that the entity was established.",
		type: "TIME"
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
		...reqSkillsOps, ...foundedOps, ...jobTypeOps, ...compRateOps, ...compTypeOps, ...skillTypeOps,
		...sanFranOps)

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
		// cities: {
		// 	"San Francisco": sanFranId
		// }
	})

	const txInfo = await publishOpsToSpace(spaceId, allOps, "Add Job opening, Company, and Requirement types (GlassDoor)")
	return txInfo
}

// some supplementary properties for mainnet
async function createMainnetSupplement(spaceId) {
	const { id: payPeriodId, ops: payPeriodOps } = grc20.Graph.createProperty({
		name: "Pay period",
		description: "The frequency of payments to the employee for holding a job.",
		type: "TEXT"
	})

	const { id: compRateId, ops: compRateOps} = grc20.Graph.createProperty({
		name: "Company rating (GlassDoor)",
		description: "The company rating, out of five stars, on GlassDoor.",
		type: "NUMBER"
	})

	const { id: foundedId, ops: foundedOps } = grc20.Graph.createProperty({
		name: "Date established",
		description: "The date that the entity was established.",
		type: "TIME"
	})

	const allOps = [
		...payPeriodOps, ...compRateOps, ...foundedOps
	]

	console.log("New property IDs", {
		compRating: compRateId,
		payPeriod: payPeriodId,
		yearEst: foundedId,
	})

	const txInfo = await publishOpsToSpace(spaceId, allOps, "Add Pay period, Company rating, and Date established properties")
	return txInfo
}

if (require.main === module) {
	async function main() {
		const wa = await getWallet()

		// createSpace("Hackathon glassdoor jobs", wa.address).then(console.log)

		// createGDTypes(process.env.GEO_TARGET_SPACE_ID).then(console.log)

		// const entity = await getFullEntity("PJYJrgcQz5hKQr9V1YAD7F")
		// const deleteOps = deleteEntity(entity)
		// await publishOpsToSpace(process.env.GEO_TARGET_SPACE_ID, deleteOps, "Test delete entity")

		createMainnetSupplement(process.env.GEO_TARGET_SPACE_ID).then(console.log)

	}
	main()
}



module.exports = {
	publishOpsToSpace,
	deleteEntity
}
