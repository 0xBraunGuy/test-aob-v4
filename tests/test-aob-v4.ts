import * as aaob from '@bonfida/aaob'
import { EventQueue } from '@bonfida/aaob'
import { sleep } from '@bonfida/utils'
import {
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	sendAndConfirmTransaction,
	Signer,
	Transaction,
	TransactionInstruction,
} from '@solana/web3.js'
import BN from 'bn.js'
import { execSync } from 'child_process'
import * as instructions from './generated/instructions'
import { PROGRAM_ID } from './generated/programId'

const PRICE_SCALE = 4
const CALLBACK_INFO_LEN = 32
const marketSigner = Keypair.generate()
const Alice = Keypair.generate()
const Bob = Keypair.generate()
let connection: Connection
const READ_COMMITMENT = 'processed'
const WRITE_COMMITMENT = 'confirmed'

describe('test-aob-v4', () => {
	it('Is initialized!', async () => {
		connection = new Connection('http://localhost:8899', READ_COMMITMENT)

		execSync(['solana program show', PROGRAM_ID.toString(), '-u l'].join(' '), {
			stdio: 'inherit',
		})

		await connection.confirmTransaction(
			await connection.requestAirdrop(marketSigner.publicKey, LAMPORTS_PER_SOL),
			WRITE_COMMITMENT,
		)

		await connection.confirmTransaction(
			await connection.requestAirdrop(Alice.publicKey, LAMPORTS_PER_SOL),
			WRITE_COMMITMENT,
		)

		await connection.confirmTransaction(
			await connection.requestAirdrop(Bob.publicKey, LAMPORTS_PER_SOL),
			WRITE_COMMITMENT,
		)

		const token = connection.onLogs(
			'all',
			(logs, ctx) => {
				console.log(logs)
			},
			READ_COMMITMENT,
		)

		/**
		 * Create Market
		 */
		const [[eventQueueKp, bids, asks, orderbook], aaobInstructions] = await aaob.createMarket(
			connection,
			marketSigner.publicKey,
			CALLBACK_INFO_LEN,
			new BN(CALLBACK_INFO_LEN),
			20,
			20,
			new BN(5),
			marketSigner.publicKey,
			new BN(1),
			PROGRAM_ID,
		)

		// Remove the AOB create_market instruction as it is not needed with lib usage
		aaobInstructions.pop()

		await sendAndConfirm(connection, aaobInstructions, [marketSigner, eventQueueKp, bids, asks, orderbook])

		/**
		 * Create Stubbed Market wrapping the AOB
		 */
		const createIx = instructions.createMarket({
			admin: marketSigner.publicKey,
			eventQueue: eventQueueKp.publicKey,
			bids: bids.publicKey,
			asks: asks.publicKey,
			orderbook: orderbook.publicKey,
		})

		await sendAndConfirm(connection, [createIx], [marketSigner])

		/**
		 * Place 6 orders: should be 3 Fill and 3 Out events in the queue
		 *  1584563250285305198614952716271615 100
		 *  1584563250285305198614952716271614 90
		 *  1584563250285305198614952716271613 80
		 */
		await Promise.all([
			placeOrder(connection, 0, 100, 2, Alice, eventQueueKp, bids, asks, orderbook),
			placeOrder(connection, 1, 100, 2, Bob, eventQueueKp, bids, asks, orderbook),
		])

		await Promise.all([
			placeOrder(connection, 0, 90, 2, Alice, eventQueueKp, bids, asks, orderbook),
			placeOrder(connection, 1, 90, 2, Bob, eventQueueKp, bids, asks, orderbook),
		])

		await Promise.all([
			placeOrder(connection, 0, 80, 2, Alice, eventQueueKp, bids, asks, orderbook),
			placeOrder(connection, 1, 80, 2, Bob, eventQueueKp, bids, asks, orderbook),
		])

		/**
		 * Check the Queue status Client side
		 */
		let eventQueue = await EventQueue.load(connection, eventQueueKp.publicKey, CALLBACK_INFO_LEN)
		console.log('eventQueue before', eventQueue.header.count.toNumber())
		logEvents(eventQueue)

		/**
		 * Consume 1 event
		 */
		const consume = instructions.consumeEvents(
			{
				numEvents: 1,
			},
			{
				admin: marketSigner.publicKey,
				orderbook: orderbook.publicKey,
				eventQueue: eventQueueKp.publicKey,
			},
		)
		await sendAndConfirm(connection, [consume], [marketSigner])

		/**
		 * Just to be safe
		 */
		await sleep(2000)

		/**
		 * Check the Queue server side
		 */
		const debugIx = instructions.debugEvents({
			admin: marketSigner.publicKey,
			eventQueue: eventQueueKp.publicKey,
		})
		await sendAndConfirm(connection, [debugIx], [marketSigner])

		/**
		 * Check the Queue client side
		 */
		eventQueue = await EventQueue.load(connection, eventQueueKp.publicKey, CALLBACK_INFO_LEN)
		console.log('eventQueue after', eventQueue.header.count.toNumber())
		logEvents(eventQueue)

		await connection.removeOnLogsListener(token)
	})
})

async function sendAndConfirm(connection: Connection, instructions: TransactionInstruction[], signers: Signer[]) {
	return await sendAndConfirmTransaction(connection, new Transaction().add(...instructions), signers, {
		skipPreflight: true,
		commitment: WRITE_COMMITMENT,
	})
}

async function placeOrder(
	connection: Connection,
	side: number,
	amount: number,
	price: number,
	owner: Keypair,
	eventQueueKp: Keypair,
	bids: Keypair,
	asks: Keypair,
	orderbook: Keypair,
): Promise<any> {
	let ix = instructions.newOrder(
		{
			price: scaleLimitPrice(price, PRICE_SCALE),
			amount: new BN(amount),
			side: side,
		},
		{
			owner: owner.publicKey,
			eventQueue: eventQueueKp.publicKey,
			bids: bids.publicKey,
			asks: asks.publicKey,
			orderbook: orderbook.publicKey,
		},
	)
	return await sendAndConfirm(connection, [ix], [owner])
}

function scaleLimitPrice(limitPrice: number, decimals: number): BN {
	const scaled = (limitPrice * Math.pow(10, decimals)).toFixed(0)
	return new BN(scaled).shln(32)
}

function logEvents(eventQueue: aaob.EventQueue) {
	for (let i = 0; i < eventQueue.header.count.toNumber(); i++) {
		const event = eventQueue.parseEvent(i)
		if (event instanceof aaob.EventOut) {
			console.log(`${i} out_event:`, event.orderId.toString(), event.baseSize.toString())
		} else if (event instanceof aaob.EventFill) {
			console.log(`${i} fill_event:`, event.makerOrderId.toString(), event.baseSize.toString())
		} else {
			throw new Error(`unknown event at ${i}`)
		}
	}
}
