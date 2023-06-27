import {
	AssetHashType,
	aws_lambda as Lambda,
	aws_s3 as S3,
	aws_s3_assets as S3Assets,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'

export class LambdaSource extends Construct {
	public readonly code: Lambda.S3Code
	constructor(
		parent: Construct,
		packedLambda: Pick<PackedLambda, 'zipFile' | 'id' | 'hash'>,
	) {
		super(parent, `${packedLambda.id}Source`)

		const asset = new S3Assets.Asset(this, 'asset', {
			path: packedLambda.zipFile,
			assetHash: packedLambda.hash,
			assetHashType: AssetHashType.CUSTOM,
		})

		const sourceCodeBucket = S3.Bucket.fromBucketName(
			this,
			'bucket',
			asset.s3BucketName,
		)

		this.code = Lambda.Code.fromBucket(sourceCodeBucket, asset.s3ObjectKey)
	}
}
