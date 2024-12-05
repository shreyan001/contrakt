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
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from "@supabase/supabase-js";
import { RunnableSequence } from "@langchain/core/runnables";
import { Document } from "@langchain/core/documents";
import { TogetherAIEmbeddings } from "@langchain/community/embeddings/togetherai";

const model = new ChatGroq({
    modelName: "llama3-8b-8192",
    temperature: 0.7,
    apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
}); 

type ContraktState = {
    input: string,
    contractData?: string | null,
    chatHistory?: BaseMessage[],
    messages?: any[] | null,
    operation?: string,
    result?: string,
}

export default function nodegraph() {
    const graph = new StateGraph<ContraktState>({
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
    graph.addNode("initial_node", async (state: ContraktState) => {
        const SYSTEM_TEMPLATE = `You are an AI agent representing Contrakt, a Web3 platform specializing in legal contract creation and NFT minting. Your task is to analyze user messages and route them appropriately.

Based on the user's input, respond with ONLY ONE of the following words:
- "contribute_node" if the user wants to report errors or contribute to the project
- "creation_node" if the user wants to create a legal contract (especially for rent subletting, NDAs, freelance gigs, project collaboration)
- "info" if the user is asking general questions about contracts, the platform, or needs basic information
- "unknown" for unrelated queries

Respond strictly with ONLY ONE of these words. No additional text.`;

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", SYSTEM_TEMPLATE],
            new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
            ["human", "{input}"]
        ]);

        const response = await prompt.pipe(model).invoke({ input: state.input, chat_history: state.chatHistory });
        const content = response.content as string;

        if (content.includes("contribute_node")) {
            return { messages: [response.content], operation: "contribute_node" };
        } else if (content.includes("creation_node")) {
            return { messages: [response.content], operation: "creation_node" };
        } else if (content.includes("info")) {
            const INFO_TEMPLATE = `You are Contrakt's educational AI assistant. Provide clear, concise explanations about:
- Basic contract concepts and terminology
- How Contrakt works
- The benefits of blockchain-based contracts
- Our supported contract types (NDAs, rent agreements, freelance contracts, etc.)

Keep responses informative but brief and user-friendly.`;
            
            const infoPrompt = ChatPromptTemplate.fromMessages([
                ["system", INFO_TEMPLATE],
                new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
                ["human", "{input}"]
            ]);
            const infoResponse = await infoPrompt.pipe(model).invoke({ input: state.input, chat_history: state.chatHistory });

            return { result: infoResponse.content as string, messages: [infoResponse.content] };
        } else if (content.includes("unknown")) {
            const CONVERSATIONAL_TEMPLATE = `You are an AI assistant for Contrakt, a Web3 platform specializing in legal contract creation and NFT minting. Your role is to help users understand our services and guide them towards the most appropriate solutions.

            Key Features:
            - Legal Contract Creation: We specialize in creating various types of legal contracts including NDAs, rent agreements, freelance contracts, and project collaboration agreements
            - NFT Integration: All contracts can be minted as NFTs on the blockchain for enhanced security and authenticity
            - User-Friendly Interface: We make contract creation and management accessible to everyone, regardless of their technical background
            - Smart Contract Security: All contracts are built with security and compliance in mind

            If the user's request is unrelated to our services, politely explain that we focus on legal contract creation and NFT minting, and suggest one of our core services that might be helpful to them. Always maintain a friendly and helpful tone, and keep responses concise and in markdown format.`;

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
            } else if (state.operation === "creation_node") {
                return "creation_node";
            } else if (state.result) {
                return "end";
            }
        },
        {
            contribute_node: "contribute_node",
            creation_node: "creation_node",
            end: END,
        }
    );

    // Contribution Node
    graph.addNode("contribute_node", async (state: ContraktState) => {
        console.log("Processing contribution or error report");

        const CONTRIBUTE_TEMPLATE = `You are an AI assistant for Contrakt, tasked with processing user contributions and error reports. Your job is to analyze the user's input and create a structured JSON response containing the following fields:

        - type: Either "error_report" or "feature_suggestion"
        - description: A brief summary of the error or suggestion
        - details: More detailed information
        - impact: Potential impact on the platform
        - priority: Suggested priority (low, medium, high)

        Based on the user's input, create a JSON object with these fields. Be concise but informative.`;

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
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const fileName = `contribution_${timestamp}.json`;
            const filePath = path.join(process.cwd(), 'contributions', fileName);

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(contributionData, null, 2));

            return { 
                result: "Thank you for your contribution. Your feedback has been received and will be reviewed by our team.",
                messages: [response.content]
            };
        } catch (error) {
            console.error("Error in contribute_node:", error);
            return { 
                result: "There was an error processing your contribution. Please try again later.",
                messages: ["Error processing contribution"]
            };
        }
    });

    // Contract Creation Node
    graph.addNode("creation_node", async (state: ContraktState) => {
        console.log("Generating legal contract");

        // Initialize Supabase and vector store
        const client = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PRIVATE_KEY!
        );

        const vectorstore = new SupabaseVectorStore(new TogetherAIEmbeddings({
            apiKey: process.env.TOGETHER_AI_API_KEY,
            model: "togethercomputer/m2-bert-80M-8k-retrieval",
        }), {
            client,
            tableName: "documents",
            queryName: "match_documents",
        });

        const retriever = vectorstore.asRetriever();

        // Convert documents to string helpers
        const convertDocsToString = (documents: Document[]): string => {
            return documents.map((document) => `<doc>\n${document.pageContent}\n</doc>`).join("\n");
        };

        // Set up retrieval chain
        const documentRetrievalChain = RunnableSequence.from([
            (input) => input,
            retriever,
            convertDocsToString
        ]);

        // Original Fetchbox logic
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

        // Retrieve relevant documents
        const retrievedDocs = await documentRetrievalChain.invoke(state.input);

        // Combine retrieved context with contract template
        const combinedContext = `${retrievedDocs}\n\nContract Template:\n${context}`;

        const contractPrompt = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt],
            new MessagesPlaceholder({ variableName: "chat_history", optional: true }),
            ["human", "{input}"],
            ["system", "Additional Context:\n{context}"]
        ]);

        try {
            const response = await contractPrompt.pipe(new ChatGroq({
                modelName: "llama3-70b-8192",
                temperature: 0.4,
                apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY,
            })).invoke({ 
                input: state.input, 
                chat_history: state.chatHistory,
                context: combinedContext
            });

            const content = response.content as string;
            const match = content.match(/```contract[\s\S]*?```/);
            let contractData = null;
            let resultData = content;

            if (match) {
                contractData = {
                    content: match[0].replace(/```contract\s?|\s?```/g, '').trim(),
                    isEditable: true,
                    status: 'draft',
                    metadata: {
                        createdAt: new Date().toISOString(),
                        lastModified: new Date().toISOString(),
                        version: '1.0'
                    }
                };
                resultData = content.replace(match[0], '').trim();
            }

            return { 
                contractData: contractData,
                result: resultData,
                messages: [content],
                contractType: 'legal'
            };
        } catch (error) {
            console.error("Error in creation_node:", error);
            return { 
                result: "Error generating contract", 
                messages: ["I apologize, but there was an error generating your legal contract. Please try again or provide more specific details about your requirements."]
            };
        }
    });
    //@ts-ignore
    graph.addEdge("contribute_node", END);
    //@ts-ignore
    graph.addEdge("creation_node", END);

    const data = graph.compile();
    return data;
}