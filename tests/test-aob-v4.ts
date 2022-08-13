import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { TestAobV4 } from "../target/types/test_aob_v4";

describe("test-aob-v4", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.TestAobV4 as Program<TestAobV4>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
