// tools for managing types and entities related to job scraping

const grc20 = require("@graphprotocol/grc-20")
const fs = require("fs")
const crypto = require("crypto")
const { getWallet } = require("./wallet.js")
require("dotenv").config()

const MAINNET = process.env.MAINNET === "true"
const gqlEndpoint = MAINNET ? "https://hypergraph.up.railway.app/graphql" : "https://geo-conduit.up.railway.app/graphql"

// console.log(grc20)

// convert a graphQL entity object to something more human-readable
function processEntityFromGraphQL(entity) {
	const returnData = {
		name: entity.name,
		id: entity.id,
		triples: [],
		relations: []
	}

	entity.triples.nodes.forEach(t => {
		returnData.triples.push({
			attributeId: t.attributeId,
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

async function getEntitiesByGraphQL(graphQlQuery) {
	const resp = await fetch(gqlEndpoint, {
		method: "POST",
		headers: {
			"Accept": "application/graphql-response+json",
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			query: graphQlQuery
		})
	})

	const json = await resp.json()
	var ents = json.data.entities
	if (ents === null) return []
	return ents.nodes.map(processEntityFromGraphQL)
}

// gets triples and relations of entity
async function getGeoEntityById(entityId) {
	// Geo query to get all triples and relations of an entity
	const entityGQL = `query {
		entities(filter: {id: {equalTo: "${entityId}"}}) {
			nodes {
				name
				id
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
	const data = await getEntitiesByGraphQL(entityGQL)
	return data[0]
}

async function getGeoEntitiesByType(targetTypeId) {
	const searchByTypeId = `query {
		entities(filter:{currentVersion:{version:{versionTypes:{some:{type:{entityId:{in: ["${targetTypeId}"]}}}}}}} first: 25 offset: 0) {
			nodes {
				name
				id
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
	const data = await getEntitiesByGraphQL(searchByTypeId)
	return data
}

// gets entities by their attribute value.
// useful when to query job openings by their URLs to see if they already exist
// since glassdoor URLs are invariant
async function getGeoEntityIdsByAttributeValue(attributeId, attributeValue) {
	const searchByAttrGQL = `query {
		triples(filter: {attributeId: {equalTo: "${attributeId}"}, and: {textValue: {equalTo: "${attributeValue}"}}}) {
			nodes {
				entityId
			}
		}
	}`

	const resp = await fetch(gqlEndpoint, {
		method: "POST",
		headers: {
			"Accept": "application/graphql-response+json",
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			query: searchByAttrGQL
		})
	})
	const json = await resp.json()
	return json.data.triples.nodes.map(n => n.entityId)
}

// get an entity by name
// optionally pass a requiredType parameter to only return results that match the type
async function geoFuzzySearch(queryTerm, requiredType = undefined) {
	const searchByName = `query {
		entities(filter:{currentVersion:{version:{name:{startsWithInsensitive:"${queryTerm}"} versionTypes:{every:{type:{entityId:{notIn: [\"Fc836HBAyTaLaZgBzcTS2a\",\"PnQsGwnnztrLNRCm9mcKKY\",\"V6R8hWrKfLZmtyv4dQyyzo\",\"9u4zseS3EDXG9ZvwR9RmqU\"]}}}}}}} first: 25 offset: 0) {
			nodes {
				name
				id
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
	const data = await getEntitiesByGraphQL(searchByName)
	if (requiredType === undefined) return data
	return data.filter(e => e.relations.some(r => r.typeId == grc20.SystemIds.TYPES_ATTRIBUTE && r.toEntityId == requiredType))
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

	const debugMode = fs.existsSync("./debug/")
	var debugId = crypto.createHash("sha256").update(String(Date.now()) + String(Math.random())).digest("hex").slice(0, 5)

	const commitName = commitMessage + (debugMode ? ` (${debugId})` : "")

	// upload changes to IPFS
	const ipfsCid = await grc20.Ipfs.publishEdit({
		name: commitName,
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

	// save debug file
	if (debugMode) {
		fs.writeFileSync(`./debug/${debugId}.json`, JSON.stringify({name: commitName, ipfsCid: ipfsCid, blockchainTx: publishTx.hash ?? publishTx, totalOpCount: ops.length, ops: ops}, null, 1))
	}

	return publishTx
}

// call getEntityTriples() above, then pass the result into here to get ops
function deleteEntity(entityObj) {
	const delOps = []

	entityObj.triples.forEach(t => {
		delOps.push(grc20.Triple.remove({
			entityId: entityObj.id,
			attributeId: t.attributeId
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
		name: "Skills",
		description: "A skill associated with an entity.",
		type: "RELATION"
	})

	const { id: employerId, ops: employerOps } = grc20.Graph.createProperty({
		name: "Employer",
		description: "That which employs, or is the employer of, the entity.",
		type: "RELATION"
	})

	const { id: jobTypeId, ops: jobTypeOps} = grc20.Graph.createType({
		name: "Job opening",
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
			grc20.ContentIds.LOCATION_ATTRIBUTE,
			"BLCNN8nrcU6T6NLu2QDQtw"] // employment type
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

	const { id: compTypeId, ops: compTypeOps} = grc20.Graph.createType({
		name: "Company",
		description: "A company profile (scraped from GlassDoor).",
		properties: [grc20.SystemIds.NAME_ATTRIBUTE,
			grc20.SystemIds.DESCRIPTION_ATTRIBUTE,
			grc20.ContentIds.AVATAR_ATTRIBUTE,
			grc20.SystemIds.COVER_ATTRIBUTE,
			compRateId,
			grc20.ContentIds.WEB_URL_ATTRIBUTE,
			foundedId]
	})

	const { id: sanFranId, ops: sanFranOps } = grc20.Graph.createEntity({
		name: "San Francisco",
		description: "A costal city in California.",
		types: [grc20.ContentIds.CITY_TYPE]
	})

	allOps.push(...minSalaryOps, ...maxSalaryOps, ...payPeriodOps, ...employerOps,
		/*...reqSkillsOps,*/ ...foundedOps, ...jobTypeOps, ...compRateOps, ...compTypeOps,
		/*...sanFranOps*/)

	console.log("Newly created entities (copy-paste into main.js):", {
		company: compTypeId,
		jobOpening: jobTypeId,
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

	const txInfo = await publishOpsToSpace(spaceId, allOps, "Setup types related to Job opening and Company (GlassDoor)")
	return txInfo
}

// some supplementary properties for mainnet
async function createMainnetSupplement(spaceId) {
	const { id: fullTimeId, ops: ftOps } = grc20.Graph.createEntity({
		name: "Full-time",
		description: "Full-time employment.",
		types: ["BLCNN8nrcU6T6NLu2QDQtw"]
	})

	const { id: inpersonId, ops: ipOps } = grc20.Graph.createEntity({
		name: "In-person",
		description: "In-person work, such that the employee must be physically present at an office or other work location.",
		types: ["BLCNN8nrcU6T6NLu2QDQtw"]
	})

	const { id: hybridId, ops: hybOps } = grc20.Graph.createEntity({
		name: "Hybrid",
		description: "A hybrid work form, combining in-person and remote aspects. Employees can sometimes choose how to work, or employers can set specific remote and in-person requirements.",
		types: ["BLCNN8nrcU6T6NLu2QDQtw"]
	})

	const { id: remoteId, ops: remtOps } = grc20.Graph.createEntity({
		name: "Remote",
		description: "A form of work which happens entirely out of an employer's offices. It is sometimes called \"virtual\" work or \"work from home.\"",
		types: ["BLCNN8nrcU6T6NLu2QDQtw"]
	})

	console.log("IDs of new employment types", {
		fullTime: fullTimeId,
		inPerson: inpersonId,
		hybrid: hybridId,
		remote: remoteId
	})

	const allOps = [...ftOps, ...ipOps, ...hybOps, ...remtOps]

	const txInfo = await publishOpsToSpace(spaceId, allOps, "Add various employment type entities")
	return txInfo
}

async function addTableToSpace(tableName, tableFilter, spaceId, spaceEntityId) {
	const tableId = await grc20.Id.generate()
	const tableOps = [
		// set up table
		grc20.Relation.make({
			relationTypeId: grc20.SystemIds.TYPES_ATTRIBUTE,
			fromId: tableId,
			toId: "PnQsGwnnztrLNRCm9mcKKY" // data block (table)
		}),
		// name the table
		grc20.Triple.make({
			attributeId: grc20.SystemIds.NAME_ATTRIBUTE,
			entityId: tableId,
			value: {
				value: tableName,
				type: "TEXT"
			}
		}),
		// set data source
		grc20.Relation.make({
			relationTypeId: "4sz7Kx91uq4KBW5sohjLkj", // Data source type
			fromId: tableId,
			toId: "8HkP7HCufp2HcCFajuJFcq" // Query data source
		}),
		// set the filter
		grc20.Triple.make({
			attributeId: "3YqoLJ7uAPmthXyXmXKoSa", // Filter
			entityId: tableId,
			value: {
				value: tableFilter,
				type: "TEXT"
			}
		}),
		// add content block to the space
		grc20.Relation.make({
			relationTypeId: "QYbjCM6NT9xmh2hFGsqpQX", // Blocks
			fromId: spaceEntityId,
			toId: tableId
		})
	]

	const tx = await publishOpsToSpace(spaceId, tableOps, "Add table")
	return tx
}

if (require.main === module) {
	async function main() {
		// const wa = await getWallet()

		// createSpace("Hackathon glassdoor jobs", wa.address).then(console.log)

		// createGDTypes(process.env.GEO_TARGET_SPACE_ID).then(console.log)

		// const entitiesToRemove = ["6rmkf4QJ6amYBCEwtfq39e", "2jJifyvC5YoFDYEShUqfDb"]
		// for (var i = 0; i < entitiesToRemove.length; i++) {
		// 	entitiesToRemove[i] = await getGeoEntityById(entitiesToRemove[i])
		// }
		// const deleteOps = []
		// entitiesToRemove.forEach(e => {
		// 	if (e != undefined) deleteOps.push(...deleteEntity(e))
		// })
		// await publishOpsToSpace(process.env.GEO_TARGET_SPACE_ID, deleteOps, "Remove tables").then(console.log)

		// const typeToRemove = "PCNrPCsgfsb2U56PAEgNNL"
		// const entsOfType = await getGeoEntitiesByType(typeToRemove)
		// const delOps = []
		// entsOfType.forEach(e => {
		// 	delOps.push(...deleteEntity(e))
		// })
		// const typeEnt = await getGeoEntityById(typeToRemove)
		// delOps.push(...deleteEntity(typeEnt))
		// await publishOpsToSpace(process.env.GEO_TARGET_SPACE_ID, delOps, "Remove extraneous type").then(console.log)

		// createMainnetSupplement(process.env.GEO_TARGET_SPACE_ID).then(console.log)

		// getGeoEntityIdsByAttributeValue("MbB6MZUTDFL9F8zp52QHCQ", "Annual").then(console.log)

		// getGeoEntitiesByType("7ZpyzJE2Zh62FpmVu5Wkc1").then(console.log)

		// addTableToSpace("Companies", '{"where":{"AND":[{"attribute":"Jfmby78N4BCseZinBmdVov","is":"FfaawFDkXPFCREizUeoAGr"}]}}', process.env.GEO_TARGET_SPACE_ID, "CJ7B5sYCd86sYP7pda6gHi").then(console.log)
	}
	main()
}



module.exports = {
	getGeoEntityIdsByAttributeValue,
	publishOpsToSpace,
	geoFuzzySearch
}
