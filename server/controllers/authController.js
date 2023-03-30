const User = require('../models/User')
const { StatusCodes } = require('http-status-codes')
const CustomError = require('../errors')
const {
  attachCookiesToResponse,
  createTokenUser,
  sendEmail,
  sendVerificationEmail,
} = require('../utils')
const crypto = require('crypto')

const register = async (req, res) => {
  const { email, name, password } = req.body

  const emailAlreadyExists = await User.findOne({ email })
  if (emailAlreadyExists) {
    throw new CustomError.BadRequestError('Email already exists')
  }

  // first registered user is an admin
  const isFirstAccount = (await User.countDocuments({})) === 0
  const role = isFirstAccount ? 'admin' : 'user'

  const verificationToken = crypto.randomBytes(40).toString('hex')

  const user = await User.create({
    name,
    email,
    password,
    role,
    verificationToken,
  })

  // origin is the development/production url of front end
  // note there is a proxy set up in front end set to localhost:5000
  const origin = 'http://localhost:3000'

  await sendVerificationEmail({
    email: user.email,
    name: user.name,
    verificationToken: user.verificationToken,
    origin,
  })

  res.status(StatusCodes.CREATED).json({
    msg: 'Success! Pleasae check your email to verify account',
  })
}

const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    throw new CustomError.BadRequestError('Please provide email and password')
  }
  const user = await User.findOne({ email })

  if (!user) {
    throw new CustomError.UnauthenticatedError('Invalid Credentials')
  }

  const isPasswordCorrect = await user.comparePassword(password)
  if (!isPasswordCorrect) {
    throw new CustomError.UnauthenticatedError('Invalid Credentials')
  }

  if (!user.isVerified) {
    throw new CustomError.UnauthenticatedError('Please verify your account')
  }

  const tokenUser = createTokenUser(user)
  attachCookiesToResponse({ res, user: tokenUser })

  res.status(StatusCodes.OK).json({ user: tokenUser })
}

const logout = async (req, res) => {
  res.cookie('token', 'logout', {
    httpOnly: true,
    expires: new Date(Date.now() + 1000),
  })
  res.status(StatusCodes.OK).json({ msg: 'user logged out!' })
}

const verifyEmail = async (req, res) => {
  const { email, verificationToken } = req.body

  if (!email || !verificationToken) {
    throw new CustomError.BadRequestError('Please provide email and token')
  }

  const user = await User.findOne({ email })
  if (!user) {
    throw new CustomError.BadRequestError('No user found with that email')
  }

  if (user.verificationToken !== verificationToken) {
    throw new CustomError.BadRequestError('Unable to access')
  }

  user.isVerified = true
  user.verified = Date.now()
  user.verificationToken = ''

  await user.save()

  res.status(StatusCodes.OK).json({ msg: 'email verified' })
}

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
}
