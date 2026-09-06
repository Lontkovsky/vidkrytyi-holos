(* SPDX-License-Identifier: AGPL-3.0-only
   Transport to the unchanged Belenios 3.3.0 partial-decryption verifier.
   The validation order follows the upstream server's
   src/web/server/common/api_elections.ml:post_partial_decryption.
   No voting cryptographic primitive is implemented here. *)

open Belenios

let read_file path =
  let channel = open_in_bin path in
  Fun.protect ~finally:(fun () -> close_in channel) (fun () ->
      really_input_string channel (in_channel_length channel))

let run () =
  if Array.length Sys.argv <> 5 then failwith "ARGUMENTS_INVALID";
  let module W = (val Election.of_string (read_file Sys.argv.(1))) in
  let open W in
  let trustees =
    trustees_of_string (sread G.of_string) (sread G.Zq.of_string)
      (read_file Sys.argv.(2))
  in
  let module T = (val Trustees.get_by_version version) in
  let module K = T.MakeCombinator (G) in
  if not (K.check trustees && G.(public_key =~ K.combine_keys trustees)) then
    failwith "TRUSTEES_INVALID";
  let keys =
    List.concat_map
      (function
        | `Single trustee -> [ trustee.trustee_public_key ]
        | `Pedersen trustees ->
            Array.to_list
              (Array.map (fun trustee -> trustee.trustee_public_key)
                 trustees.t_verification_keys))
      trustees
    |> Array.of_list
  in
  let tally =
    encrypted_tally_of_string (sread G.of_string) (read_file Sys.argv.(3))
  in
  let partial, owner =
    match String.split_on_char '\n' (read_file Sys.argv.(4)) with
    | [ partial; owner ] -> (partial, owned_of_string read_hash owner)
    | _ -> failwith "SHARE_FORMAT_INVALID"
  in
  if owner.owned_owner < 1 || owner.owned_owner > Array.length keys
     || owner.owned_payload <> Hash.hash_string partial then
    failwith "SHARE_OWNER_INVALID";
  let proof =
    partial_decryption_of_string (sread G.of_string) (sread G.Zq.of_string)
      partial
  in
  if string_of_partial_decryption (swrite G.to_string) (swrite G.Zq.to_string)
       proof <> partial
     || not (E.check_factor tally keys.(owner.owned_owner - 1) proof) then
    failwith "SHARE_PROOF_INVALID"

let () =
  try run () with _ ->
    prerr_endline "NATIVE_SHARE_REJECTED";
    exit 1
