import { useAccount } from 'wagmi'
import { useState, useEffect } from 'react'
import { formatEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { publicClient } from '@/walletConnect/siwe'

type Asset = {
    name: string
    symbol: string
    balance: number
    price: number
    value: number
  }
  
  export default function PortfolioWallet() {
    const { address, isConnected } = useAccount()

    const [assets, setAssets] = useState<Asset[]>([])
    const [netWorth, setNetWorth] = useState(0)
    const [profit, setProfit] = useState(0)

    useEffect(() => {
      if (isConnected && address) {
        fetchAssetData()
      }
    }, [isConnected, address])

    const fetchAssetData = async () => {
      if (!address) return

      let ethPrice = 2600 // Default fallback price
      let ethBalance = BigInt(0)

      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
        if (!response.ok) {
          throw new Error('Failed to fetch ETH price')
        }
        const data = await response.json()
        ethPrice = data.ethereum.usd
      } catch (error) {
        console.error('Error fetching ETH price, using fallback:', error)
        // We'll use the fallback price defined above
      }

      try {
        ethBalance = await publicClient.getBalance({ address })
      } catch (error) {
        console.error('Error fetching balance:', error)
      }

      const ethBalanceNumber = parseFloat(formatEther(ethBalance))
      const ethValue = ethBalanceNumber * ethPrice

      const newAssets: Asset[] = [
        {
          name: "Ethereum",
          symbol: "ETH",
          balance: ethBalanceNumber,
          price: ethPrice,
          value: ethValue
        }
      ]

      setAssets(newAssets)
      setNetWorth(ethValue)
      // For this example, we'll set a static profit. In a real app, you'd calculate this based on historical data.
      setProfit(5.5)
    }

    if (!isConnected) {
      return <div>Please connect your wallet</div>
    }

    return (
      <div className="w-[90%] bg-black text-white font-mono p-3 rounded-lg border border-[#90EE90]">
        <h2 className="text-xl font-bold mb-3 text-[#90EE90]">Agent Resources</h2>
        <div className="mb-4 bg-gray-900 p-3 rounded-lg">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-gray-400">Balance</p>
              <p>${netWorth.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Net Worth</p>
              <p>${netWorth.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Profit</p>
              <p className="text-[#90EE90]">+{profit.toFixed(2)}%</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-[#90EE90] mb-1">Available Assets</h3>
          {assets.map((asset, index) => (
            <div key={index} className="bg-gray-900 p-2 rounded-lg text-xs">
              <div className="flex justify-between items-center">
                <p className="font-bold">{asset.symbol}</p>
                <p>${asset.value.toLocaleString()}</p>
              </div>
              <div className="flex justify-between text-gray-400">
                <p>{asset.balance.toLocaleString()}</p>
                <p>${asset.price.toLocaleString()}/token</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }