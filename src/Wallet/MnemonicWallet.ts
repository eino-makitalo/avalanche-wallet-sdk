import * as bip39 from 'bip39';
import * as bip32 from 'bip32';
import { EvmWallet } from './EvmWallet';
import { UnsafeWallet, WalletNameType } from './types';
import { Buffer } from 'avalanche';
import { FeeMarketEIP1559Transaction, Transaction } from '@ethereumjs/tx';
import { Tx as AVMTx, UnsignedTx as AVMUnsignedTx } from 'avalanche/dist/apis/avm';
import { Tx as PlatformTx, UnsignedTx as PlatformUnsignedTx } from 'avalanche/dist/apis/platformvm';
import { KeyPair as AVMKeyPair, KeyChain as AVMKeyChain } from 'avalanche/dist/apis/avm/keychain';
import { KeyChain as PlatformKeyChain } from 'avalanche/dist/apis/platformvm';
import { UnsignedTx as EVMUnsignedTx, Tx as EVMTx, KeyPair as EVMKeyPair } from 'avalanche/dist/apis/evm';
import { CypherAES, digestMessage } from '@/utils';
import { HDWalletAbstract } from '@/Wallet/HDWalletAbstract';
import { bintools } from '@/common';
import { getAccountPathAvalanche, getAccountPathEVM } from '@/Wallet/helpers/derivationHelper';

//TODO: Should extend public mnemonic wallet
export class MnemonicWallet extends HDWalletAbstract implements UnsafeWallet {
    evmWallet: EvmWallet;
    type: WalletNameType;
    private mnemonicCypher: CypherAES;
    accountIndex: number;

    private ethAccountKey: bip32.BIP32Interface;

    constructor(mnemonic: string, account = 0) {
        let seed: globalThis.Buffer = bip39.mnemonicToSeedSync(mnemonic);

        let masterHdKey = bip32.fromSeed(seed);
        let accountKey = masterHdKey.derivePath(getAccountPathAvalanche(account));

        super(accountKey);

        this.type = 'mnemonic';
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error('Invalid mnemonic phrase.');
        }

        let ethAccountKey = masterHdKey.derivePath(getAccountPathEVM(account));
        this.ethAccountKey = ethAccountKey;
        let ethKey = ethAccountKey.privateKey;
        let evmWallet = new EvmWallet(ethKey!);

        this.accountIndex = account;
        this.mnemonicCypher = new CypherAES(mnemonic);
        this.evmWallet = evmWallet;
    }

    /**
     * Returns the derived private key used by the EVM wallet.
     */
    public getEvmPrivateKeyHex(): string {
        return this.evmWallet.getPrivateKeyHex();
    }

    /**
     * Return the mnemonic phrase for this wallet.
     */
    public getMnemonic(): string {
        return this.mnemonicCypher.getValue();
    }

    /**
     * Generates a 24 word mnemonic phrase and initializes a wallet instance with it.
     * @return Returns the initialized wallet.
     */
    static create(): MnemonicWallet {
        const mnemonic = bip39.generateMnemonic(256);
        return MnemonicWallet.fromMnemonic(mnemonic);
    }

    /**
     * Returns a new 24 word mnemonic key phrase.
     */
    static generateMnemonicPhrase(): string {
        return bip39.generateMnemonic(256);
    }

    /**
     * Returns a new instance of a Mnemonic wallet from the given key phrase.
     * @param mnemonic The 24 word mnemonic phrase of the wallet
     */
    static fromMnemonic(mnemonic: string): MnemonicWallet {
        return new MnemonicWallet(mnemonic);
    }

    /**
     * Validates the given string is a valid mnemonic.
     * @param mnemonic
     */
    static validateMnemonic(mnemonic: string): boolean {
        return bip39.validateMnemonic(mnemonic);
    }

    /**
     * Signs an EVM transaction on the C chain.
     * @param tx The unsigned transaction
     */
    async signEvm(tx: Transaction | FeeMarketEIP1559Transaction): Promise<Transaction | FeeMarketEIP1559Transaction> {
        return this.evmWallet.signEVM(tx);
    }

    /**
     * Signs an AVM transaction.
     * @param tx The unsigned transaction
     */
    async signX(tx: AVMUnsignedTx): Promise<AVMTx> {
        return tx.sign(this.getKeyChainX());
    }

    /**
     * Signs a PlatformVM transaction.
     * @param tx The unsigned transaction
     */
    async signP(tx: PlatformUnsignedTx): Promise<PlatformTx> {
        return tx.sign(this.getKeyChainP());
    }

    /**
     * Signs a C chain transaction
     * @remarks
     * Used for Import and Export transactions on the C chain. For everything else, use `this.signEvm()`
     * @param tx The unsigned transaction
     */
    async signC(tx: EVMUnsignedTx): Promise<EVMTx> {
        return this.evmWallet.signC(tx);
    }

    /**
     * Returns a keychain with the keys of every derived X chain address.
     * @private
     */
    private getKeyChainX(): AVMKeyChain {
        let internal = this.internalScan.getKeyChainX();
        let external = this.externalScan.getKeyChainX();
        return internal.union(external);
    }

    /**
     * Returns a keychain with the keys of every derived P chain address.
     * @private
     */
    private getKeyChainP(): PlatformKeyChain {
        return this.externalScan.getKeyChainP();
    }

    // TODO: Support internal address as well
    signMessage(msgStr: string, index: number): string {
        let key = this.externalScan.getKeyForIndexX(index) as AVMKeyPair;
        let digest = digestMessage(msgStr);

        // Convert to the other Buffer and sign
        let digestHex = digest.toString('hex');
        let digestBuff = Buffer.from(digestHex, 'hex');
        let signed = key.sign(digestBuff);

        return bintools.cb58Encode(signed);
    }
}
