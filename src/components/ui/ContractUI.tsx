'use client'

import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, Edit, ExternalLink, Check, Save } from 'lucide-react'
import { useWalletClient, useAccount } from 'wagmi'
import { Textarea } from '@/components/ui/textarea'
export function LegalContractDisplay({ contractData }: { contractData: string }) {
  const [isDeployed, setIsDeployed] = useState(false)
  const [showContract, setShowContract] = useState(true)
  const [ipfsHash, setIpfsHash] = useState<string>('')
  const [isCopied, setIsCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContract, setEditedContract] = useState(contractData)
  const [isLoading, setIsLoading] = useState(false)
  const { data: walletClient } = useWalletClient()
  const { address: walletAddress } = useAccount()

  const handleCopy = () => {
    navigator.clipboard.writeText(editedContract)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSave = () => {
    setIsEditing(false)
  }

  const handleMint = async () => {
    setIsLoading(true)
    try {
      // Upload to IPFS/Filecoin
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContract }),
      })
      const { hash } = await response.json()
      
      // Mint NFT with IPFS hash
      const mintResponse = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          hash,
          address: walletAddress,
          content: editedContract
        }),
      })
      
      if (mintResponse.ok) {
        setIpfsHash(hash)
        setIsDeployed(true)
        setShowContract(false)
      }
    } catch (error) {
      console.error('Error minting contract:', error)
    }
    setIsLoading(false)
  }

  return (
    <div className="w-full max-w-2xl bg-gray-900 text-white rounded-md overflow-hidden border border-white font-mono">
      <div className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">Legal Contract</h3>
          {!isDeployed && (
            <div className="flex gap-2">
              <Button
                onClick={handleCopy}
                variant="outline"
                size="sm"
                className="text-white border-white hover:bg-white hover:text-black"
              >
                {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              {!isEditing ? (
                <Button
                  onClick={handleEdit}
                  variant="outline"
                  size="sm"
                  className="text-white border-white hover:bg-white hover:text-black"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  variant="outline"
                  size="sm"
                  className="text-white border-white hover:bg-white hover:text-black"
                >
                  <Save className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        {showContract && (
          <ScrollArea className="h-96 w-full border border-white rounded-md p-2">
            {isEditing ? (
              <Textarea
                value={editedContract}
                onChange={(e) => setEditedContract(e.target.value)}
                className="min-h-[384px] bg-transparent text-white"
              />
            ) : (
              <pre className="text-sm">
                <code>{editedContract}</code>
              </pre>
            )}
          </ScrollArea>
        )}
        {isDeployed && !showContract && (
          <div className="bg-gray-900 p-4 rounded-md border border-[#FFC700] mb-4">
            <div className="space-y-2">
              <p className="text-green-400 font-semibold">Contract minted successfully!</p>
              <p className="text-sm">
                <span className="text-gray-300">IPFS Hash:</span>{' '}
                <span className="text-blue-400 break-all cursor-pointer" onClick={() => navigator.clipboard.writeText(ipfsHash)} title="Click to copy">
                  {ipfsHash}
                </span>
              </p>
              <div className="mt-4">
                <a
                  href={`https://ipfs.io/ipfs/${ipfsHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FFC700] hover:underline flex items-center gap-2"
                >
                  View on IPFS <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="bg-[#FFC700] text-black p-4 flex justify-between items-center">
        {!isDeployed ? (
          <Button 
            onClick={handleMint} 
            className="bg-black text-white border border-white hover:bg-white hover:text-black transition-colors duration-200"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="animate-pulse mr-2">●</span>
                Minting...
              </>
            ) : (
              'Mint Contract'
            )}
          </Button>
        ) : (
          <Button
            onClick={() => setShowContract(!showContract)}
            variant="outline"
            size="sm"
            className="bg-black text-white border border-white hover:bg-white hover:text-black transition-colors duration-200"
          >
            {showContract ? 'Hide Contract' : 'Show Contract'}
          </Button>
        )}
      </div>
    </div>
  )
}