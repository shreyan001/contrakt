import { ethers } from "ethers";
import { StateGraph } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { START, END } from "@langchain/langgraph";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ChatGroq } from "@langchain/groq";
import { systemPrompt } from "./contractTemplate";
import { ChatOpenAI } from "@langchain/openai";
import { fetchboxPrompt } from "./fetchbox"
import { contractsArray } from "@/lib/contractCompile";
import fs from 'fs/promises';
import path from 'path';



const KEY = "sk-proj-73353444-0000-0000-0000-000000000000";
const model = new ChatOpenAI({
    modelName: "phi",
    temperature: 0.7,
    maxTokens: 18192,
    apiKey: KEY,
    configuration: {
        baseURL: "https://phi.us.gaianet.network/v1",
    },
});

type guildState = {
    input: string,
    contractData?: string | null,
    chatHistory?: BaseMessage[],
    messages?: any[] | null,
    operation?: string,
    result?: string,
}

export default function nodegraph() {
    const graph = new StateGraph<guildState>({
        channels: {
            messages: { value: (x: any[], y: any[]) => x.concat(y) },
            input: { value: null },
            result: { value: null },
            contractData: { value: null },
            chatHistory: { value: null },
            operation: { value: null }
        }
    });

    // Initial Node: Routes user requests to the appropriate node
    graph.addNode("initial_node", async (state: guildState) => {
        const SYSTEM_TEMPLATE = `You are an AI agent representing EscrowGuild, a platform specializing in secure and efficient escrow services within the Web3 ecosystem. Your task is to analyze user messages and route them to the appropriate node. EscrowGuild offers various escrow smart contracts for different types of asset exchanges, including ETH, ERC20 tokens, and NFTs.

Based on the user's input, respond with ONLY ONE of the following words:
- "contribute_node" if the user wants to report any errors or contribute to the project
- "escrow_Node" if the request is related to creating escrow smart contracts.
- "unknown" if the request doesn't fit into any of the above categories

Context for decision-making:
- Escrow smart contracts involve secure peer-to-peer exchanges between various assets like ETH, ERC20 tokens, and NFTs.
- The platform supports multiple types of  smart contract exchanges, such as ETH to ERC20, NFT to ETH, NFT to ERC20, NFT to NFT, and ERC20 to ERC20.
- User contributions can include reporting errors, suggesting improvements, or offering to help develop the project.

Respond strictly with ONLY ONE of these words: "contribute_node", "escrow_Node", or "unknown". Provide no additional text or explanation.`;

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", SYSTEM_TEMPLATE],
            new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
            ["human", "{input}"]
        ]);

        const response = await prompt.pipe(model).invoke({ input: state.input, chat_history: state.chatHistory });

        console.log(response.content, "Initial Message");

        const content = response.content as string;
        if (content.includes("contribute_node")) {
            return { messages: [response.content], operation: "contribute_node" };
        } else if (content.includes("escrow_Node")) {
            return { messages: [response.content], operation: "escrow_Node" };
        } else if (content.includes("unknown")) {
            const CONVERSATIONAL_TEMPLATE = `You are an AI assistant for EscrowGuild. The Agents Node within the EscrowGuild framework is designed to facilitate interactions between users and specialized agents, each tailored to address specific tasks related to building and managing escrow smart contracts within the Web3 ecosystem.

            Key Features:
            - Role Definition: Each agent within the node has distinct roles, such as managing escrow transactions or handling contract verifications. For instance, the EscrowSmartContract agent focuses on secure transaction management, while the ContractVerification agent ensures the integrity and security of deployed contracts.
            - User Interaction: The node engages users conversationally, answering questions about the guild, its operations, and the specific roles of its agents. This creates a welcoming environment for users to explore the available functionalities.
            - Data Handling: The Agents Node efficiently processes user inputs, ensuring that data requests are met with clear, actionable information. This helps users navigate their inquiries with ease and confidence.
            - Collaborative Framework: The node is part of a larger ecosystem within EscrowGuild, promoting collaboration among agents to deliver comprehensive solutions to users.

            This structure enables EscrowGuild to offer tailored, user-friendly interactions, enhancing the overall experience in the Web3 and escrow smart contract space.

            If the user's request is unrelated to our services, politely explain that we cannot process their request and suggest something related to EscrowGuild that they might find interesting. Always maintain a friendly and helpful tone, and don't give long responses; keep it short or medium length and concise in markdown format.`;

            const conversationalPrompt = ChatPromptTemplate.fromMessages([
                ["system", CONVERSATIONAL_TEMPLATE],
                new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
                ["human", "{input}"]
            ]);
            const summaryModel = model.withConfig({ runName: "Summarizer" });
            const conversationalResponse = await conversationalPrompt.pipe(summaryModel).invoke({ input: state.input, chat_history: state.chatHistory });

            return { result: conversationalResponse.content as string, messages: [conversationalResponse.content] };
        } 
    });

    //@ts-ignore
    graph.addEdge(START, "initial_node");
    //@ts-ignore
    graph.addConditionalEdges("initial_node",
        async (state) => {
            if (!state.messages || state.messages.length === 0) {
                console.error("No messages in state");
                return "end";
            }

            if (state.operation === "contribute_node") {
                return "contribute_node";
            } else if (state.operation === "escrow_Node") {
                return "escrow_node";
            } else if (state.result) {
                return "end";
            }
        },
        {
            contribute_node: "contribute_node",
            escrow_node: "escrow_node",
            end: END,
        }
    );

    // Add the contribute_node
    graph.addNode("contribute_node", async (state: guildState) => {
        console.log("Processing contribution or error report");

        const CONTRIBUTE_TEMPLATE = `You are an AI assistant for EscrowGuild, tasked with processing user contributions and error reports. Your job is to analyze the user's input and create a structured JSON response containing the following fields:

        - type: Either "error_report" or "code_contribution"
        - description: A brief summary of the error or contribution
        - details: More detailed information about the error or contribution
        - impact: Potential impact of the error or the benefit of the contribution
        - priority: Suggested priority (low, medium, high)

        Based on the user's input, create a JSON object with these fields. Be concise but informative in your responses.`;

        const contributePrompt = ChatPromptTemplate.fromMessages([
            ["system", CONTRIBUTE_TEMPLATE],
            new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
            ["human", "{input}"]
        ]);

        try {
            const response = await contributePrompt.pipe(model).invoke({ 
                input: state.input, 
                chat_history: state.chatHistory
            });

            const contributionData = JSON.parse(response.content as string);

            // Save the contribution data to a file
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const fileName = `contribution_${timestamp}.json`;
            const filePath = path.join(process.cwd(), 'contributions', fileName);

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(contributionData, null, 2));

            return { 
                result: "Thank you for your contribution. Your response has been received successfully and will be reviewed by our team.",
                messages: [response.content]
            };
        } catch (error) {
            console.error("Error in contribute_node:", error);
            return { 
                result: "Your error has been received successfully and will be reviewed by our team.",
                messages: ["Error processing contribution"]
            };
        }
    });

    // Add the Escrow_Node
    graph.addNode("escrow_node", async (state: guildState) => {
        console.log("Generating Escrow contract");

     // Ensure this is a string
        const FetchboxPrompt = ChatPromptTemplate.fromMessages([
            ["system", fetchboxPrompt],
            ["human", "{input}"]
        ]);

        const fetchboxResponse = await FetchboxPrompt.pipe(model).invoke({ input: state.input });
        
        let index: number | string;
        let context: any;
        if (!isNaN(Number(fetchboxResponse.content))) {
            index = parseInt(fetchboxResponse.content as string, 10);
        } else {
            index = fetchboxResponse.content as string;
        }
        
        if (typeof index === 'number' && !isNaN(index)) {
            context = contractsArray[index].contractCode;
        } else {
            context = index;
        }

        const escrowPrompt = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt],
            new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
            ["human", "{input}"]
        ]);

        try {
            const response = await escrowPrompt.pipe(new ChatGroq({
                modelName: "llama3-8b-8192",
                temperature: 0.9,
                apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
            })).invoke({ 
                input: state.input, 
                chat_history: state.chatHistory,
                context: context
            });

            const content = response.content as string;

            const match = content.match(/```solidity[\s\S]*?```/); // Updated regex to match the 'solidity' language specifier
            let contractData = null;
            let resultData = content;

            if (match) {
                // Remove the backticks and 'solidity' language specifier
                contractData = match[0].replace(/```solidity\s?|\s?```/g, '').trim();
                // Remove the contract code from the result
                resultData = content.replace(match[0], '').trim();
            }

            return { 
                contractData: contractData,
                result: resultData,
                messages: [content] 
            };
        } catch (error) {
            console.error("Error in escrow_node:", error);
            return { 
                result: "Error generating Escrow contract", 
                messages: ["I apologize, but there was an error generating the Escrow contract. Please try again or provide more information about your requirements."]
            };
        }
    });

    //@ts-ignore    
    graph.addEdge("contribute_node", END);
    //@ts-ignore
    graph.addEdge("escrow_node", END);

    const data = graph.compile();
    return data;
}