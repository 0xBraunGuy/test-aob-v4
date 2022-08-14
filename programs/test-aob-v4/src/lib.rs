use agnostic_orderbook::state::event_queue::*;
use agnostic_orderbook::state::orderbook::CallbackInfo;
use agnostic_orderbook::state::*;
use anchor_lang::prelude::*;
use borsh::{BorshDeserialize, BorshSerialize};
use bytemuck::{Pod, Zeroable};

declare_id!("Dgth76j3CNxmCgkSUVKZCvdgRCConmJkXkT6pgPqLSKs");

#[program]
pub mod test_aob_v4 {
	use super::*;

	pub fn create_market(ctx: Context<CreateMarket>) -> Result<()> {
		let invoke_params =
			agnostic_orderbook::instruction::create_market::Params {
				min_base_order_size: 1,
				tick_size: 1,
			};

		let invoke_accounts =
			agnostic_orderbook::instruction::create_market::Accounts {
				market: &ctx.accounts.orderbook,
				event_queue: &ctx.accounts.event_queue,
				bids: &ctx.accounts.bids,
				asks: &ctx.accounts.asks,
			};
		if let Err(error) =
			agnostic_orderbook::instruction::create_market::process::<
				OwnerCallback,
			>(ctx.program_id, invoke_accounts, invoke_params)
		{
			msg!("{}", error);
			return Err(error.into());
		}
		Ok(())
	}

	pub fn new_order(
		ctx: Context<NewOrder>,
		price: u64,
		amount: u64,
		side: u8,
	) -> Result<()> {
		msg!("new_order {}, {}, {}", price, amount, side);
		let aob_side = match side {
			0 => Side::Bid,
			1 => Side::Ask,
			_ => panic!(),
		};

		let aob_param = agnostic_orderbook::instruction::new_order::Params::<
			OwnerCallback,
		> {
			max_base_qty: amount,
			max_quote_qty: u64::MAX,
			limit_price: price,
			side: aob_side,
			match_limit: 10,
			post_only: false,
			post_allowed: true,
			callback_info: OwnerCallback {
				pk: ctx.accounts.owner.key(),
			},
			self_trade_behavior:
				agnostic_orderbook::state::SelfTradeBehavior::AbortTransaction,
		};

		let aob_accounts =
			agnostic_orderbook::instruction::new_order::Accounts {
				market: &ctx.accounts.orderbook,
				asks: &ctx.accounts.asks,
				bids: &ctx.accounts.bids,
				event_queue: &ctx.accounts.event_queue,
			};

		let order_summary =
			agnostic_orderbook::instruction::new_order::process::<OwnerCallback>(
				ctx.program_id,
				aob_accounts,
				aob_param,
			)?;
		msg!("order_summary {:?}", order_summary);
		Ok(())
	}

	pub fn consume_events(
		ctx: Context<ConsumeSingleEvent>,
		num_events: u8,
	) -> Result<()> {
		let aob_params =
			agnostic_orderbook::instruction::consume_events::Params {
				number_of_entries_to_consume: num_events as u64,
			};
		let aob_accounts =
			agnostic_orderbook::instruction::consume_events::Accounts {
				market: &ctx.accounts.orderbook,
				event_queue: &ctx.accounts.event_queue,
				reward_target: &ctx.accounts.admin,
			};
		if let Err(error) =
			agnostic_orderbook::instruction::consume_events::process::<
				OwnerCallback,
			>(ctx.program_id, aob_accounts, aob_params)
		{
			msg!("{}", error);
			return Err(error.into());
		}
		Ok(())
	}

	pub fn debug_events(ctx: Context<DebugEvents>) -> Result<()> {
		let mut event_queue_guard = ctx.accounts.event_queue.data.borrow_mut();
		let event_queue = EventQueue::<OwnerCallback>::from_buffer(
			&mut event_queue_guard,
			AccountTag::EventQueue,
		)?;

		msg!(
			"event_queue {}, {}, {}",
			ctx.accounts.event_queue.key(),
			event_queue.is_empty(),
			event_queue.len()
		);
		msg!("peek 0 {:?}", event_queue.peek_at(0).unwrap());

		// changing event_queue.rs to :
		// pub fn get_event()
		// we can see the old event still there event after being processed
		// msg!("get_event 0 {:?}", event_queue.get_event(0));

		for i in 0..event_queue.len() {
			let event = event_queue.peek_at(i).unwrap();
			match event {
				EventRef::Fill(FillEventRef {
					event:
						&FillEvent {
							taker_side: _,
							maker_order_id,
							quote_size: _,
							base_size,
							tag: _,
							..
						},
					maker_callback_info: _,
					taker_callback_info: _,
				}) => {
					msg!(" {}, fill_event {}, {}", i, maker_order_id, base_size)
				}
				EventRef::Out(OutEventRef {
					event:
						&OutEvent {
							tag: _,
							side: _,
							base_size,
							order_id,
							..
						},
					callback_info: _,
				}) => {
					msg!(" {}, out_event {}, {}", i, order_id, base_size)
				}
			}
		}
		Ok(())
	}
}

#[derive(
	BorshDeserialize,
	BorshSerialize,
    Debug,
	Clone,
	Copy,
	Zeroable,
	Pod,
    PartialEq,
)]
#[repr(C)]
pub struct OwnerCallback {
	pk: Pubkey,
}

impl CallbackInfo for OwnerCallback {
	type CallbackId = Pubkey;

	fn as_callback_id(&self) -> &Self::CallbackId {
		return &self.pk;
	}
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
	#[account(mut)]
	pub admin: Signer<'info>,

	#[account(mut)]
	/// CHECK:
	pub event_queue: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub bids: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub asks: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub orderbook: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct NewOrder<'info> {
	#[account()]
	pub owner: Signer<'info>,

	#[account(mut)]
	/// CHECK:
	pub event_queue: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub asks: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub bids: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub orderbook: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ConsumeSingleEvent<'info> {
	#[account(mut)]
	pub admin: Signer<'info>,

	#[account(mut)]
	/// CHECK:
	pub event_queue: AccountInfo<'info>,

	#[account(mut)]
	/// CHECK:
	pub orderbook: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DebugEvents<'info> {
	#[account(mut)]
	pub admin: Signer<'info>,

	#[account(mut)]
	/// CHECK:
	pub event_queue: AccountInfo<'info>,
}
