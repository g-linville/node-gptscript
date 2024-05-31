import * as gptscript from "../src/gptscript"
import path from "path"
import {fileURLToPath} from "url"

let client: gptscript.Client
const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe("gptscript module", () => {
	beforeAll(async () => {
		if (!process.env.OPENAI_API_KEY && !process.env.GPTSCRIPT_URL) {
			throw new Error("neither OPENAI_API_KEY nor GPTSCRIPT_URL is set")
		}

		client = new gptscript.Client()
	})
	afterAll(() => {
		client.close()
	})

	test("creating an closing another client should work", async () => {
		const other = new gptscript.Client()
		await other.version()
		other.close()
	})

	test("listTools returns available tools", async () => {
		const tools = await client.listTools()
		expect(tools).toBeDefined()
	})

	test("listModels returns a list of models", async () => {
		// Similar structure to listTools
		let models = await client.listModels()
		expect(models).toBeDefined()
	})

	test("version returns a gptscript version", async () => {
		// Similar structure to listTools
		let version = await client.version()
		expect(version).toContain("gptscript version")
	})

	test("evaluate executes a prompt correctly", async () => {
		const t = {
			instructions: "who was the president of the united states in 1928?"
		}

		const run = await client.evaluate(t as any)
		expect(run).toBeDefined()
		expect(await run.text()).toContain("Calvin Coolidge")
	})

	test("evaluate executes and streams a prompt correctly", async () => {
		let out = ""
		let err = undefined
		const t = {
			instructions: "who was the president of the united states in 1928?"
		}
		const opts = {
			disableCache: true,
		}

		const run = await client.evaluate(t as any, opts)
		run.on(gptscript.RunEventType.CallProgress, (data: gptscript.CallFrame) => {
			for (let output of data.output) out += `system: ${output.content}`
		})

		await run.text()
		err = run.err

		expect(out).toContain("Calvin Coolidge")
		expect(err).toEqual("")
	})

	test("evaluate executes a prompt correctly with context", async () => {
		let out = ""
		let err = undefined
		const t = {
			instructions: "who was the president of the united states in 1928?",
			context: [path.join(__dirname, "fixtures", "acorn-labs-context.gpt")]
		}

		const run = await client.evaluate(t as any, {disableCache: true})
		out = await run.text()
		err = run.err

		expect(out).toContain("Acorn Labs")
		expect(err).toEqual("")
	})

	test("should execute test.gpt correctly", async () => {
		const testGptPath = path.join(__dirname, "fixtures", "test.gpt")

		const result = await (await client.run(testGptPath)).text()
		expect(result).toBeDefined()
		expect(result).toContain("Calvin Coolidge")
	})

	test("run executes and stream a file correctly", async () => {
		let out = ""
		let err = undefined
		const testGptPath = path.join(__dirname, "fixtures", "test.gpt")
		const opts = {
			disableCache: true,
		}

		const run = await client.run(testGptPath, opts)
		run.on(gptscript.RunEventType.CallProgress, data => {
			for (let output of data.output) out += `system: ${output.content}`
		})
		await run.text()
		err = run.err

		expect(out).toContain("Calvin Coolidge")
		expect(err).toEqual("")
	})

	test("run executes and streams a file with global tools correctly", async () => {
		let out = ""
		let err = undefined
		const testGptPath = path.join(__dirname, "fixtures", "global-tools.gpt")
		const opts = {
			disableCache: true,
		}

		const run = await client.run(testGptPath, opts)
		run.on(gptscript.RunEventType.CallProgress, data => {
			for (let output of data.output) out += `system: ${output.content}`
		})
		await run.text()
		err = run.err

		expect(out).toContain("Hello!")
		expect(err).toEqual("")
	}, 15000)

	test("aborting a run is reported correctly", async () => {
		let errMessage = ""
		let err = undefined
		const testGptPath = path.join(__dirname, "fixtures", "test.gpt")
		const opts = {
			disableCache: true,
		}

		try {
			const run = await client.run(testGptPath, opts)
			run.on(gptscript.RunEventType.CallProgress, data => {
				run.close()
			})
			await run.text()
			err = run.err
		} catch (error: any) {
			errMessage = error
		}

		expect(errMessage).toContain("aborted")
		expect(err).toBeUndefined()
	})

	describe("evaluate with multiple tools", () => {
		test("multiple tools", async () => {
			const t0 = {
				tools: ["ask"],
				instructions: "Only use the ask tool to ask who was the president of the united states in 1928?"
			}
			const t1 = {
				name: "ask",
				description: "This tool is used to ask a question",
				arguments: {
					type: "object",
					question: "The question to ask"
				},
				instructions: "${question}"
			}

			const response = await (await client.evaluate([t0 as any, t1 as any])).text()
			expect(response).toBeDefined()
			expect(response).toContain("Calvin Coolidge")
		}, 30000)

		test("with sub tool", async () => {
			const t0 = {
				tools: ["ask"],
				instructions: "Only use the ask tool to ask who was the president of the united states in 1928?"
			} as any
			const t1 = {
				name: "other",
				instructions: "Who was the president of the united states in 1986?"
			} as any
			const t2 = {
				name: "ask",
				description: "This tool is used to ask a question",
				arguments: {
					type: "object",
					question: "The question to ask"
				},
				instructions: "${question}"
			} as any

			const response = await (await client.evaluate([t0, t1, t2], {subTool: "other"})).text()
			expect(response).toBeDefined()
			expect(response).toContain("Ronald Reagan")
		}, 30000)
	})

	test("parse file", async () => {
		const response = await client.parse(path.join(__dirname, "fixtures", "test.gpt"))
		expect(response).toBeDefined()
		expect(response).toHaveLength(1)
		expect((response[0] as gptscript.Tool).instructions).toEqual("who was the president in 1928?")
	}, 30000)

	test("parse string tool", async () => {
		const tool = "How much wood would a woodchuck chuck if a woodchuck could chuck wood?"
		const response = await client.parseTool(tool)
		expect(response).toBeDefined()
		expect(response).toHaveLength(1)
		expect((response[0] as gptscript.Tool).instructions).toEqual(tool)
	}, 30000)

	test("parse string tool with text node", async () => {
		const tool = "How much wood would a woodchuck chuck if a woodchuck could chuck wood?\n---\n!markdown\nThis is a text node"
		const response = await client.parseTool(tool)
		expect(response).toBeDefined()
		expect(response).toHaveLength(2)
		expect((response[0] as gptscript.Tool).instructions).toEqual("How much wood would a woodchuck chuck if a woodchuck could chuck wood?")
		expect((response[1] as gptscript.Text).content).toEqual("This is a text node")
	}, 30000)

	test("parse string tool global tools", async () => {
		const tool = "Global Tools: acorn, do-work\nHow much wood would a woodchuck chuck if a woodchuck could chuck wood?"
		const response = await client.parseTool(tool)
		expect(response).toBeDefined()
		expect(response).toHaveLength(1)
		expect((response[0] as gptscript.Tool).instructions).toEqual("How much wood would a woodchuck chuck if a woodchuck could chuck wood?")
		expect((response[0] as gptscript.Tool).globalTools).toEqual(["acorn", "do-work"])
	}, 30000)

	test("parse string tool first line shebang", async () => {
		const tool = "\n#!/usr/bin/env python\nHow much wood would a woodchuck chuck if a woodchuck could chuck wood?"
		const response = await client.parseTool(tool)
		expect(response).toBeDefined()
		expect(response).toHaveLength(1)
		expect((response[0] as gptscript.Tool).instructions).toEqual("#!/usr/bin/env python\nHow much wood would a woodchuck chuck if a woodchuck could chuck wood?")
	}, 30000)

	test("format tool", async () => {
		const tool = {
			type: "tool",
			tools: ["sys.write", "sys.read"],
			instructions: "This is a test",
			arguments: {
				type: "object",
				properties: {
					text: {
						type: "string",
						description: "The text to write"
					}
				}
			}
		}

		const response = await client.stringify([tool as any])
		expect(response).toBeDefined()
		expect(response).toContain("Tools: sys.write, sys.read")
		expect(response).toContain("This is a test")
		expect(response).toContain("Args: text: The text to write")
	})

	test("exec tool with chat", async () => {
		let err = undefined
		const t = {
			chat: true,
			instructions: "You are a chat bot. Don't finish the conversation until I say 'bye'.",
			tools: ["sys.chat.finish"]
		}
		const opts = {
			disableCache: true,
		}
		let run = await client.evaluate(t as any, opts)

		const inputs = [
			"List the three largest states in the United States by area.",
			"What is the capital of the third one?",
			"What timezone is the first one in?"
		]

		const expectedOutputs = [
			"California",
			"Sacramento",
			"Alaska Time Zone"
		]

		await run.text()
		for (let i: number = 0; i < inputs.length; i++) {
			run = run.nextChat(inputs[i])
			err = run.err

			if (err) {
				break
			}

			expect(await run.text()).toContain(expectedOutputs[i])
			expect(run.state).toEqual(gptscript.RunState.Continue)
		}

		run = run.nextChat("bye")
		await run.text()

		expect(run.state).toEqual(gptscript.RunState.Finished)
		expect(err).toEqual("")
	}, 60000)

	test("exec file with chat", async () => {
		let err = undefined
		const opts = {
			disableCache: true
		}
		let run = await client.run(path.join(__dirname, "fixtures", "chat.gpt"), opts)

		const inputs = [
			"List the 3 largest of the Great Lakes by volume.",
			"What is the volume of the second one in cubic miles?",
			"What is the total area of the third one in square miles?"
		]

		const expectedOutputs = [
			"Lake Superior",
			"Lake Michigan",
			"Lake Huron"
		]

		await run.text()
		for (let i: number = 0; i < inputs.length; i++) {
			run = run.nextChat(inputs[i])
			err = run.err

			if (err) {
				break
			}

			expect(await run.text()).toContain(expectedOutputs[i])
			expect(run.state).toEqual(gptscript.RunState.Continue)
		}

		run = run.nextChat("bye")
		await run.text()

		expect(run.state).toEqual(gptscript.RunState.Finished)
		expect(err).toEqual("")
	}, 60000)

	test("nextChat on file providing chat state", async () => {
		let run = await client.run(path.join(__dirname, "fixtures", "chat.gpt"), {disableCache: true})

		run = run.nextChat("List the 3 largest of the Great Lakes by volume.")
		expect(await run.text()).toContain("Lake Superior")
		expect(run.err).toEqual("")
		expect(run.state).toEqual(gptscript.RunState.Continue)

		run = await client.run(path.join(__dirname, "fixtures", "chat.gpt"), {
			disableCache: true,
			input: "What is the total area of the third one in square miles?",
			chatState: run.currentChatState()
		})

		expect(await run.text()).toContain("Lake Huron")
		expect(run.err).toEqual("")
		expect(run.state).toEqual(gptscript.RunState.Continue)
	}, 10000)

	test("nextChat on tool providing chat state", async () => {
		const t = {
			chat: true,
			instructions: "You are a chat bot. Don't finish the conversation until I say 'bye'.",
			tools: ["sys.chat.finish"]
		}
		let run = await client.evaluate(t as any, {disableCache: true})

		run = run.nextChat("List the three largest states in the United States by area.")
		expect(await run.text()).toContain("California")
		expect(run.err).toEqual("")
		expect(run.state).toEqual(gptscript.RunState.Continue)

		run = await client.evaluate(t as any, {
			disableCache: true,
			input: "What is the capital of the second one?",
			chatState: run.currentChatState()
		})

		expect(await run.text()).toContain("Austin")
		expect(run.err).toEqual("")
		expect(run.state).toEqual(gptscript.RunState.Continue)
	}, 10000)

	test("confirm", async () => {
		let confirmFound = false
		const t = {
			instructions: "List the files in the current working directory.",
			tools: ["sys.exec"]
		}
		const run = await client.evaluate(t as any, {confirm: true})
		run.on(gptscript.RunEventType.CallConfirm, async (data: gptscript.CallFrame) => {
			expect(data.input).toContain(`"ls"`)
			confirmFound = true
			await client.confirm({id: data.id, accept: true})
		})

		expect(await run.text()).toContain("README.md")
		expect(run.err).toEqual("")
		expect(confirmFound).toBeTruthy()
	})

	test("do not confirm", async () => {
		let confirmFound = false
		const t = {
			instructions: "List the files in the current working directory.",
			tools: ["sys.exec"]
		}
		const run = await client.evaluate(t as any, {confirm: true})
		run.on(gptscript.RunEventType.CallConfirm, async (data: gptscript.CallFrame) => {
			expect(data.input).toContain(`"ls"`)
			confirmFound = true
			await client.confirm({id: data.id, accept: false, message: "I will not allow it!"})
		})

		expect(await run.text()).toContain("authorization error")
		expect(run.err).toEqual("")
		expect(confirmFound).toBeTruthy()
	})

	test("prompt", async () => {
		let promptFound = false
		const t = {
			instructions: "Use the sys.prompt user to ask the user for 'first name' which is not sensitive. After you get their first name, say hello.",
			tools: ["sys.prompt"]
		}
		const run = await client.evaluate(t as any)
		run.on(gptscript.RunEventType.Prompt, async (data: gptscript.PromptFrame) => {
			expect(data.message).toContain("first name")
			expect(data.fields.length).toEqual(1)
			expect(data.fields[0]).toEqual("first name")
			expect(data.sensitive).toBeFalsy()

			promptFound = true
			await client.promptResponse({id: data.id, responses: {[data.fields[0]]: "Clicky"}})
		})

		expect(await run.text()).toContain("Clicky")
		expect(run.err).toEqual("")
		expect(promptFound).toBeTruthy()
	})
})
